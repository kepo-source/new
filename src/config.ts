import "dotenv/config";
import type { ProviderName } from "./providers/types.js";

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

function normalizeBaseUrl(raw: string, fallback: string): string {
  return (raw || fallback).replace(/\/$/, "");
}

// === Provider LLM ===
const geminiKey = optional("GEMINI_API_KEY");
const groqKey = optional("GROQ_API_KEY");
const xkiroKey = optional("XKIRO_API_KEY");
const xkiroKeyV2 = optional("XKIRO_API_KEY_V2");
const xkiroKeyV3 = optional("XKIRO_API_KEY_V3");

const XKIRO_DEFAULT_MODEL = "mistralai/mistral-large-2512";
const xkiroModel = optional("XKIRO_MODEL", XKIRO_DEFAULT_MODEL);
const xkiroBaseUrl = normalizeBaseUrl(
  optional("XKIRO_BASE_URL"),
  "https://api.xkiro.com/v1",
);

const availableProviders: ProviderName[] = [];
// Urutan prioritas: key xKiro dulu (3 akun), baru provider lama.
if (xkiroKey) availableProviders.push("xkiro");
if (xkiroKeyV2) availableProviders.push("xkirov2");
if (xkiroKeyV3) availableProviders.push("xkirov3");
if (geminiKey) availableProviders.push("gemini");
if (groqKey) availableProviders.push("groq");

if (availableProviders.length === 0) {
  throw new Error(
    "Minimal satu provider LLM harus diisi: XKIRO_API_KEY (atau _V2/_V3), GEMINI_API_KEY, atau GROQ_API_KEY.",
  );
}

const configWarnings: string[] = [];

export type GeminiThinkingLevel =
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

const GEMINI_THINKING_LEVELS: GeminiThinkingLevel[] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

function geminiThinkingLevel(): GeminiThinkingLevel {
  const raw = optional("GEMINI_THINKING_LEVEL", "low").toLowerCase();
  if ((GEMINI_THINKING_LEVELS as string[]).includes(raw)) {
    return raw as GeminiThinkingLevel;
  }
  configWarnings.push(
    `GEMINI_THINKING_LEVEL=${raw} tidak dikenal. Pakai 'low'. Pilihan: ${GEMINI_THINKING_LEVELS.join(", ")}.`,
  );
  return "low";
}

function resolveProvider(
  envName: string,
  fallbackOrder: ProviderName[],
): ProviderName {
  const requested = optional(envName).toLowerCase();

  if (requested) {
    if ((availableProviders as string[]).includes(requested)) {
      return requested as ProviderName;
    }
    configWarnings.push(
      `${envName}=${requested} tidak tersedia (key belum diisi). Pakai provider lain yang aktif.`,
    );
  }

  const first = fallbackOrder.find((name) => availableProviders.includes(name));
  if (!first) {
    throw new Error(`Tidak ada provider yang bisa dipakai untuk ${envName}.`);
  }
  return first;
}

const FALLBACK_ORDER: ProviderName[] = [
  "xkiro",
  "xkirov2",
  "xkirov3",
  "gemini",
  "groq",
];

const defaultProvider = resolveProvider("DEFAULT_PROVIDER", FALLBACK_ORDER);
const deepProvider = resolveProvider("DEEP_PROVIDER", FALLBACK_ORDER);

export const config = {
  telegramToken: telegramToken(),
  allowedChatIds: parseChatIds(optional("ALLOWED_CHAT_IDS")),
  availableProviders,
  defaultProvider,
  deepProvider,
  gemini: {
    apiKey: geminiKey,
    model: optional("GEMINI_MODEL", "gemini-3.5-flash-lite"),
    thinkingLevel: geminiThinkingLevel(),
  },
  groq: {
    apiKey: groqKey,
    model: optional("GROQ_MODEL", "openai/gpt-oss-120b"),
    baseUrl: normalizeBaseUrl(
      optional("GROQ_BASE_URL"),
      "https://api.groq.com/openai/v1",
    ),
  },
  xkiro: {
    apiKey: xkiroKey,
    model: xkiroModel,
    baseUrl: xkiroBaseUrl,
  },
  xkirov2: {
    apiKey: xkiroKeyV2,
    model: optional("XKIRO_MODEL_V2", xkiroModel),
    baseUrl: normalizeBaseUrl(optional("XKIRO_BASE_URL_V2"), xkiroBaseUrl),
  },
  xkirov3: {
    apiKey: xkiroKeyV3,
    model: optional("XKIRO_MODEL_V3", xkiroModel),
    baseUrl: normalizeBaseUrl(optional("XKIRO_BASE_URL_V3"), xkiroBaseUrl),
  },
  sheets: {
    spreadsheetId: normalizeSheetId(optional("GOOGLE_SHEETS_ID")),
    serviceAccountB64: optional("GOOGLE_SA_B64"),
  },
  budgetUsd: (() => {
    const raw = Number(optional("DAILY_BUDGET_USD", "1"));
    return Number.isFinite(raw) ? Math.max(0, raw) : 1;
  })(),
  // HEALTH_PORT menang atas PORT supaya environment lokal yang sudah punya
  // PORT (mis. sandbox/IDE) tidak bentrok. Di Railway, PORT tetap dipakai.
  port: Number(optional("HEALTH_PORT") || process.env.PORT || 8080),
  logLevel: optional("LOG_LEVEL", "info"),
  timezone: optional("TZ", "Asia/Jakarta"),
  telegram: {
    mode: optional("TELEGRAM_MODE", "auto").toLowerCase(),
    publicDomain: optional("PUBLIC_DOMAIN") || optional("RAILWAY_PUBLIC_DOMAIN"),
    webhookSecret: optional("TELEGRAM_WEBHOOK_SECRET"),
    webhookPath: optional("TELEGRAM_WEBHOOK_PATH", "/telegram"),
  },
} as const;

export { configWarnings };

export const sheetsEnabled = Boolean(
  config.sheets.spreadsheetId && config.sheets.serviceAccountB64,
);

export const SYSTEM_PROMPT = [
  "Kamu adalah asisten pribadi lewat Telegram.",
  "Jawab dengan bahasa Indonesia yang santai tapi jelas, ringkas, dan langsung ke inti.",
  "Kalau pertanyaan butuh langkah, pakai poin-poin pendek.",
  "Jangan mengarang fakta. Kalau tidak yakin, bilang tidak tahu.",
].join(" ");
