"""Client Google Sheets untuk second-brain.

Memakai GOOGLE_SHEETS_ID + GOOGLE_SA_B64 yang sudah dipakai bot TypeScript lama.
Tidak membuat sheet/tab baru — tab `messages` dan header A1:J1 sudah ada.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Iterable

SCOPE = "https://www.googleapis.com/auth/spreadsheets"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets"
TAB = "messages"
HEADERS = [
    "ts",
    "chat_id",
    "role",
    "model",
    "prompt_chars",
    "tokens_in",
    "tokens_out",
    "latency_ms",
    "cost_usd",
    "routed_by",
]

# Harga per 1M token (USD) — perkiraan, sama dengan src/util/cost.ts lama.
PRICES: dict[str, tuple[float, float]] = {
    "mistralai/mistral-medium-3.5": (0.0, 0.0),
    "mistralai/mistral-large-2512": (0.0, 0.0),
    "cohere/command-a": (0.0, 0.0),
    "gemini-3.5-flash-lite": (0.0, 0.0),
    "openai/gpt-oss-120b": (0.15, 0.75),
    "openai/gpt-oss-20b": (0.075, 0.3),
}
FALLBACK_PRICE = (1.0, 3.0)

_token: str = ""
_token_expiry: float = 0.0
_token_lock = threading.Lock()


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _credentials() -> dict[str, Any]:
    raw = os.getenv("GOOGLE_SHEETS_ID", "").strip()
    if not raw:
        raise RuntimeError("GOOGLE_SHEETS_ID belum diisi")
    b64 = os.getenv("GOOGLE_SA_B64", "").strip()
    if not b64:
        raise RuntimeError("GOOGLE_SA_B64 belum diisi")
    creds = json.loads(base64.b64decode(b64 + "=" * (-len(b64) % 4)).decode("utf-8"))
    if not creds.get("client_email") or not creds.get("private_key"):
        raise RuntimeError("GOOGLE_SA_B64 bukan service-account JSON yang valid")
    return creds


def _make_jwt(creds: dict[str, Any]) -> str:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claims = {
        "iss": creds["client_email"],
        "scope": SCOPE,
        "aud": TOKEN_URL,
        "iat": now,
        "exp": now + 3600,
    }
    encode = lambda obj: _b64url(
        json.dumps(obj, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signing_input = f"{encode(header)}.{encode(claims)}"
    key = serialization.load_pem_private_key(
        creds["private_key"].encode("utf-8"), password=None
    )
    signature = key.sign(
        signing_input.encode("ascii"), padding.PKCS1v15(), hashes.SHA256()
    )
    return f"{signing_input}.{_b64url(signature)}"


def access_token(force: bool = False) -> str:
    global _token, _token_expiry
    with _token_lock:
        if not force and _token and time.time() < _token_expiry - 60:
            return _token
        body = urllib.parse.urlencode(
            {
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": _make_jwt(_credentials()),
            }
        ).encode("ascii")
        req = urllib.request.Request(
            TOKEN_URL,
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        _token = payload["access_token"]
        _token_expiry = time.time() + int(payload.get("expires_in", 3600))
        return _token


def _spreadsheet_id() -> str:
    return os.getenv("GOOGLE_SHEETS_ID", "").strip()


def _api(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{SHEETS_BASE}/{urllib.parse.quote(_spreadsheet_id(), safe='')}/{path}"
    data = None
    headers = {"Authorization": f"Bearer {access_token()}"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.loads(resp.read().decode("utf-8"))


def append_rows(rows: Iterable[list[Any]]) -> int:
    batch = [list(row) for row in rows]
    if not batch:
        return 0
    query = urllib.parse.urlencode(
        {"valueInputOption": "RAW", "insertDataOption": "INSERT_ROWS"}
    )
    _api("POST", f"values/{TAB}!A:J:append?{query}", {"values": batch})
    return len(batch)


def read_rows() -> list[list[Any]]:
    result = _api("GET", f"values/{TAB}!A2:J20000")
    return [list(row) for row in result.get("values", [])]


def estimate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    price_in, price_out = PRICES.get(model, FALLBACK_PRICE)
    return (tokens_in / 1_000_000) * price_in + (tokens_out / 1_000_000) * price_out


def format_usd(value: float) -> str:
    return f"${value:.3f}" if value >= 0.01 else f"${value:.5f}"


def _today() -> str:
    from zoneinfo import ZoneInfo

    tz = os.getenv("TZ", "Asia/Jakarta").strip() or "Asia/Jakarta"
    try:
        return datetime.now(ZoneInfo(tz)).date().isoformat()
    except Exception:
        return datetime.now().date().isoformat()


def _usage(day: str) -> tuple[dict[str, int | float], dict[str, dict[str, int | float]]]:
    totals: dict[str, int | float] = {"calls": 0, "tokens_in": 0, "tokens_out": 0, "cost": 0.0}
    by_model: dict[str, dict[str, int | float]] = {}

    def add(target: dict[str, int | float], row: list[Any]) -> None:
        target["calls"] += 1
        target["tokens_in"] += int(float(row[5] or 0))
        target["tokens_out"] += int(float(row[6] or 0))
        target["cost"] += float(row[8] or 0)

    for row in read_rows():
        ts = str(row[0] or "")
        if not ts or not ts.startswith(day):
            continue
        if str(row[2] or "assistant") != "assistant":
            continue
        model = str(row[3] or "unknown")
        by_model.setdefault(model, {"calls": 0, "tokens_in": 0, "tokens_out": 0, "cost": 0.0})
        add(totals, row)
        add(by_model[model], row)
    return totals, by_model


def stats_text(day: str | None = None) -> str:
    day = day or _today()
    totals, by_model = _usage(day)
    budget = float(os.getenv("DAILY_BUDGET_USD", "1.00") or 0)
    lines = [
        f"📊 Stats {day} ({int(totals['calls'])} request)",
        f"Token: {int(totals['tokens_in']):,} in / {int(totals['tokens_out']):,} out",
        f"Biaya: {format_usd(float(totals['cost']))} dari {format_usd(budget)}",
        f"Sisa: {format_usd(max(0.0, budget - float(totals['cost'])))}",
    ]
    if by_model:
        lines += ["", "Per model:"]
        for model, usage in sorted(by_model.items()):
            lines.append(
                f"• {model}: {int(usage['calls'])}x · {format_usd(float(usage['cost']))}"
            )
    return "\n".join(lines)


def budget_text(day: str | None = None) -> str:
    day = day or _today()
    totals, _ = _usage(day)
    budget = float(os.getenv("DAILY_BUDGET_USD", "1.00") or 0)
    used = float(totals["cost"])
    ratio = min(1.0, used / budget) if budget > 0 else 0.0
    filled = round(ratio * 12)
    bar = "█" * filled + "░" * (12 - filled)
    return "\n".join(
        [
            f"💸 Budget harian: {format_usd(budget)}",
            f"{bar} {ratio * 100:.0f}%",
            f"Terpakai: {format_usd(used)}",
            f"Sisa: {format_usd(max(0.0, budget - used))}",
        ]
    )


def main(argv: list[str]) -> int:
    command = argv[1] if len(argv) > 1 else "ping"
    day = argv[2] if len(argv) > 2 else None
    try:
        if command == "stats":
            print(stats_text(day))
        elif command == "budget":
            print(budget_text(day))
        elif command == "append":
            rows = json.loads(sys.stdin.read())
            print(f"append={append_rows(rows)}")
        elif command == "ping":
            print(f"ok sheet={_spreadsheet_id()} tab={TAB}")
        else:
            print(f"perintah unknown: {command}", file=sys.stderr)
            return 2
        return 0
    except Exception as exc:
        print(f"second-brain-sheets: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
