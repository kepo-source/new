/**
 * Harga per 1 juta token (USD). Angka ini perkiraan dan bisa berubah —
 * sesuaikan dengan halaman pricing masing-masing provider kalau perlu.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "grok-4": { input: 3, output: 15 },
  "grok-3": { input: 3, output: 15 },
  "grok-3-mini": { input: 0.3, output: 0.5 },
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
