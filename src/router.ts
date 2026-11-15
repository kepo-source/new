import { config } from "./config.js";
import type { ProviderName } from "./providers/types.js";

export interface RouteDecision {
  provider: ProviderName;
  reason: string;
}

/**
 * Heuristik routing sederhana dan deterministik (tanpa panggilan LLM tambahan,
 * supaya cepat dan tidak menambah biaya).
 *
 * Pertanyaan "berat" diarahkan ke deep provider (Gemini/Groq), sisanya ke
 * default provider.
 */
const DEEP_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\banali(s|sa|sis|tik)\b/i, label: "analisa" },
  { pattern: /\bbanding(kan|in)\b/i, label: "banding" },
  { pattern: /\bprediksi\b/i, label: "prediksi" },
  { pattern: /\bstrategi\b/i, label: "strategi" },
  { pattern: /\b(kenapa|mengapa)\b/i, label: "sebab-akibat" },
  { pattern: /\btrade.?off\b/i, label: "trade-off" },
  { pattern: /\b(evaluasi|kritik|review mendalam)\b/i, label: "evaluasi" },
  { pattern: /\b(riset|research)\b/i, label: "riset" },
  { pattern: /\b(arsitektur|architecture|refactor)\b/i, label: "teknis berat" },
  { pattern: /\b(debug|root cause)\b/i, label: "debug" },
];

export function pickProvider(text: string): RouteDecision {
  if (text.length > 4000) {
    return { provider: config.defaultProvider, reason: "teks panjang" };
  }

  for (const { pattern, label } of DEEP_PATTERNS) {
    if (pattern.test(text)) {
      return { provider: config.deepProvider, reason: `keyword:${label}` };
    }
  }

  return { provider: config.defaultProvider, reason: "default" };
}
