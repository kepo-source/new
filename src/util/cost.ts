/**
 * Harga per 1 juta token (USD). Angka ini perkiraan dan bisa berubah —
 * sesuaikan dengan halaman pricing masing-masing provider kalau perlu.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "openai/gpt-oss-120b": { input: 0.15, output: 0.75 },
  "openai/gpt-oss-20b": { input: 0.075, output: 0.3 },
  "qwen/qwen3.8-27b": { input: 0.29, output: 0.59 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  // xKiro — model free tier (harga di katalog: 0/0).
  "mistralai/mistral-large-2512": { input: 0, output: 0 },
  "mistralai/mistral-medium-3.5": { input: 0, output: 0 },
  "cohere/command-a": { input: 0, output: 0 },
};

const FALLBACK = { input: 1, output: 3 };

export function estimateCost(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const price = PRICES[model] ?? FALLBACK;
  return (tokensIn / 1_000_000) * price.input + (tokensOut / 1_000_000) * price.output;
}

export function formatUsd(value: number): string {
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(5)}`;
}
