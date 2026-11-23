"""Plugin pencatat pemakaian ke Google Sheet lama (tab `messages`).

Hook `pre_llm_call` menyimpan panjang prompt, `post_api_request` menyusun baris
dengan token/latency/biaya. Baris dikirim batch (10 baris atau 30 detik).
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any

from . import sheets_client

logger = logging.getLogger(__name__)

FLUSH_EVERY = 10
FLUSH_INTERVAL_MS = 30_000
MAX_QUEUE = 500

_queue: list[list[Any]] = []
_prompt_chars: dict[str, int] = {}
_lock = threading.Lock()
_timer: threading.Thread | None = None


def _chat_id() -> int:
    raw = os.getenv("TELEGRAM_ALLOWED_USERS", "")
    match = re.search(r"-?\d+", raw)
    return int(match.group(0)) if match else 0


def _key(kwargs: dict[str, Any]) -> str:
    return str(kwargs.get("task_id") or kwargs.get("session_id") or "default")


def _on_pre_llm_call(**kwargs: Any) -> None:
    message = str(kwargs.get("user_message") or "")
    with _lock:
        _prompt_chars[_key(kwargs)] = len(message)


def _usage_value(usage: dict[str, Any], *names: str) -> int:
    for name in names:
        value = usage.get(name)
        if value is not None:
            try:
                return int(value)
            except (TypeError, ValueError):
                pass
    return 0


def _on_post_api_request(**kwargs: Any) -> None:
    if not (os.getenv("GOOGLE_SHEETS_ID", "").strip() and os.getenv("GOOGLE_SA_B64", "").strip()):
        return

    usage = kwargs.get("usage") or {}
    if not isinstance(usage, dict):
        usage = {}
    tokens_in = _usage_value(usage, "prompt_tokens", "input_tokens")
    tokens_out = _usage_value(usage, "output_tokens", "completion_tokens")
    model = str(kwargs.get("model") or kwargs.get("response_model") or "unknown")
    provider = str(kwargs.get("provider") or "custom")
    call_count = kwargs.get("api_call_count") or 1
    latency_ms = int(float(kwargs.get("api_duration") or 0) * 1000)

    with _lock:
        prompt_chars = _prompt_chars.pop(_key(kwargs), 0)

    row: list[Any] = [
        datetime.now(timezone.utc).isoformat(),
        _chat_id(),
        "assistant",
        model,
        prompt_chars,
        tokens_in,
        tokens_out,
        latency_ms,
        round(sheets_client.estimate_cost(model, tokens_in, tokens_out), 6),
        f"{provider}:api#{call_count}",
    ]

    should_flush = False
    with _lock:
        _queue.append(row)
        if len(_queue) >= FLUSH_EVERY:
            should_flush = True
    if should_flush:
        flush()


def flush() -> None:
    with _lock:
        if not _queue:
            return
        batch = _queue[:200]
        del _queue[: len(batch)]

    try:
        sheets_client.append_rows(batch)
    except Exception as exc:
        logger.warning("second-brain-sheets: gagal kirim %d baris: %s", len(batch), exc)
        with _lock:
            _queue[:0] = batch
            if len(_queue) > MAX_QUEUE:
                del _queue[: len(_queue) - MAX_QUEUE]


def _periodic_flush() -> None:
    while True:
        time.sleep(FLUSH_INTERVAL_MS / 1000)
        try:
            flush()
        except Exception as exc:
            logger.warning("second-brain-sheets: flush error: %s", exc)


def register(ctx: Any) -> None:
    global _timer
    ctx.register_hook("pre_llm_call", _on_pre_llm_call)
    ctx.register_hook("post_api_request", _on_post_api_request)
    if _timer is None:
        _timer = threading.Thread(target=_periodic_flush, name="second-brain-sheets", daemon=True)
        _timer.start()
    logger.info("second-brain-sheets plugin aktif (tab=%s)", sheets_client.TAB)
