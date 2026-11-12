import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value === "..." || value === "-") {
    throw new Error(
      `Env var ${name} belum diisi. Salin .env.example menjadi .env lalu lengkapi.`,
    );
  }
  return value;
}

function telegramToken(): string {
  const token = required("TELEGRAM_BOT_TOKEN");
  if (!/^\d+:[A-Za-z0-9_-]{35}$/.test(token)) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN formatnya tidak valid. Harus seperti 123456789:AAH... (35 karakter setelah titik dua).",
    );
  }
  return token;
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name]?.trim();
  if (!value || value === "..." || value === "-") return fallback;
  return value;
}

/** Terima ID spreadsheet mentah maupun URL lengkap. */
function normalizeSheetId(raw: string): string {
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? raw;
}

function parseChatIds(raw: string): Set<number> {
  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((id) => Number.isFinite(id));
  if (ids.length === 0) {
    throw new Error(
      "ALLOWED_CHAT_IDS kosong/tidak valid. Isi minimal satu chat ID (contoh: 123456789).",
    );
  }
  return new Set(ids);
}

export const config = {
  telegramToken: telegramToken(),
  allowedChatIds: parseChatIds(optional("ALLOWED_CHAT_IDS")),
  gemini: {
    apiKey: required("GEMINI_API_KEY"),
    model: optional("GEMINI_MODEL", "gemini-2.5-flash"),
  },
  grok: {
    apiKey: required("XAI_API_KEY"),
    model: optional("GROK_MODEL", "grok-4"),
    baseUrl: optional("XAI_BASE_URL", "https://api.x.ai/v1").replace(/\/$/, ""),
  },
  sheets: {
    spreadsheetId: normalizeSheetId(optional("GOOGLE_SHEETS_ID")),
    serviceAccountB64: optional("GOOGLE_SA_B64"),
  },
  budgetUsd: Math.max(0, Number(optional("DAILY_BUDGET_USD", "1")) || 1),
  port: Number(process.env.PORT ?? 8080),
  logLevel: optional("LOG_LEVEL", "info"),
  timezone: optional("TZ", "Asia/Jakarta"),
} as const;

export const sheetsEnabled = Boolean(
  config.sheets.spreadsheetId && config.sheets.serviceAccountB64,
);

export const SYSTEM_PROMPT = [
  "Kamu adalah asisten pribadi lewat Telegram.",
  "Jawab dengan bahasa Indonesia yang santai tapi jelas, ringkas, dan langsung ke inti.",
  "Kalau pertanyaan butuh langkah, pakai poin-poin pendek.",
  "Jangan mengarang fakta. Kalau tidak yakin, bilang tidak tahu.",
].join(" ");
