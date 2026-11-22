import { config } from "../config.js";
import { createOpenAiCompatibleProvider } from "./openai.js";
import type { Provider } from "./types.js";

export type XkiroName = "xkiro" | "xkirov2" | "xkirov3";

/**
 * xKiro adalah gateway AI dengan endpoint OpenAI-compatible.
 * Model memakai format `vendor/model`, mis. `mistralai/mistral-large-2512`.
 * Tiap nama provider memakai API key sendiri supaya bisa saling fallback
 * kalau salah satu kena rate limit.
 */
export function createXkiroProvider(name: XkiroName = "xkiro"): Provider {
  const settings = config[name];
  return createOpenAiCompatibleProvider({
    name,
    model: settings.model,
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    maxTokensField: "max_tokens",
    // Request blocking xKiro dipotong pada 95 detik.
    timeoutMs: 90_000,
  });
}
