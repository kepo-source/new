export const TELEGRAM_LIMIT = 3900;

/** Pecah teks panjang supaya aman di bawah limit 4096 karakter Telegram. */
export function chunkText(text: string, limit = TELEGRAM_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let rest = text;

  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit * 0.5) cut = limit;

    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }

  if (rest.length > 0) chunks.push(rest);
  return chunks;
}

export function truncate(text: string, max = 280): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
