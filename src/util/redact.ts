/**
 * Sanitasi nilai sebelum masuk log. Jangan pernah biarkan token/API key
 * tercetak di log — terutama karena error jaringan sering menyertakan URL
 * lengkap (contoh: https://api.telegram.org/bot<TOKEN>/...).
 */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/bot\d+:[A-Za-z0-9_-]+/g, "bot[redacted]"],
  [/\b(?:gsk_|xai-|sk-)[A-Za-z0-9_-]{8,}/g, "[redacted-key]"],
  [/\bAIza[A-Za-z0-9_-]{10,}/g, "[redacted-key]"],
  [/\bAQ\.[A-Za-z0-9_.-]{10,}/g, "[redacted-key]"],
  [/\bBearer\s+[A-Za-z0-9._-]{10,}/gi, "Bearer [redacted]"],
];

export function redactString(value: string): string {
  let result = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[too-deep]";

  if (typeof value === "string") return redactString(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, depth + 1));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redactDeep(item, depth + 1);
    }
    return result;
  }

  return value;
}
