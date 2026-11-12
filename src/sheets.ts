import { google, type sheets_v4 } from "googleapis";
import { config, sheetsEnabled } from "./config.js";
import { logger } from "./util/logger.js";

const TAB = "messages";
const HEADERS = [
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
];
const FLUSH_EVERY = 10;
const FLUSH_INTERVAL_MS = 30_000;
const MAX_QUEUE = 500;

export interface ExchangeLog {
  chatId: number;
  model: string;
  promptChars: number;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  costUsd: number;
  routedBy: string;
  role?: string;
  ts?: string;
}

export interface UsageTotals {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export interface TodayUsage {
  totals: UsageTotals;
  byModel: Record<string, UsageTotals>;
}

let api: sheets_v4.Sheets | null = null;
let queue: Array<Array<string | number>> = [];
let flushing = false;
let timer: NodeJS.Timeout | null = null;

function emptyTotals(): UsageTotals {
  return { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
}

function addTotals(target: UsageTotals, row: Array<string | number>): void {
  target.calls += 1;
  target.tokensIn += Number(row[5]) || 0;
  target.tokensOut += Number(row[6]) || 0;
  target.cost += Number(row[8]) || 0;
}

async function ensureTab(client: sheets_v4.Sheets): Promise<void> {
  const spreadsheetId = config.sheets.spreadsheetId;

  const meta = await client.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  const titles = (meta.data.sheets ?? []).map((sheet) => sheet.properties?.title);

  if (!titles.includes(TAB)) {
    await client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: TAB } } }],
      },
    });
    logger.info({ tab: TAB }, "Tab Sheets dibuat");
  }

  const header = await client.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB}!A1:J1`,
  });

  if (!header.data.values?.[0]?.length) {
    await client.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
    logger.info("Header tab messages ditulis");
  }
}

export async function initSheets(): Promise<void> {
  if (!sheetsEnabled) {
    logger.warn(
      "Google Sheets dimatikan (GOOGLE_SHEETS_ID / GOOGLE_SA_B64 kosong). Log hanya di memori.",
    );
    return;
  }

  try {
    const credentials = JSON.parse(
      Buffer.from(config.sheets.serviceAccountB64, "base64").toString("utf8"),
    ) as Record<string, unknown>;

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    api = google.sheets({ version: "v4", auth });
    await ensureTab(api);

    if (!timer) {
      timer = setInterval(() => {
        void flushSheets();
      }, FLUSH_INTERVAL_MS);
      timer.unref?.();
    }

    logger.info("Google Sheets siap");
  } catch (error) {
    api = null;
    logger.error(
      { err: error },
      "Gagal init Google Sheets — cek GOOGLE_SA_B64 dan akses spreadsheet",
    );
  }
}

export function logExchange(exchange: ExchangeLog): void {
  queue.push([
    exchange.ts ?? new Date().toISOString(),
    exchange.chatId,
    exchange.role ?? "assistant",
    exchange.model,
    exchange.promptChars,
    exchange.tokensIn,
    exchange.tokensOut,
    exchange.latencyMs,
    Number(exchange.costUsd.toFixed(6)),
    exchange.routedBy,
  ]);

  if (queue.length >= FLUSH_EVERY) {
    void flushSheets();
  }
}

export async function flushSheets(): Promise<void> {
  if (!api || flushing || queue.length === 0) return;

  flushing = true;
  const batch = queue.splice(0, 200);

  try {
    await api.spreadsheets.values.append({
      spreadsheetId: config.sheets.spreadsheetId,
      range: `${TAB}!A:J`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: batch },
    });
    logger.debug({ rows: batch.length }, "Log terkirim ke Sheets");
  } catch (error) {
    logger.error({ err: error }, "Gagal kirim log ke Sheets, dibalikin ke queue");
    queue.unshift(...batch);
    if (queue.length > MAX_QUEUE) {
      queue = queue.slice(-MAX_QUEUE);
    }
  } finally {
    flushing = false;
  }
}

export async function getTodayUsage(day: string): Promise<TodayUsage | null> {
  if (!api) return null;

  try {
    const response = await api.spreadsheets.values.get({
      spreadsheetId: config.sheets.spreadsheetId,
      range: `${TAB}!A2:J20000`,
    });

    const rows = (response.data.values ?? []) as Array<Array<string | number>>;
    const totals = emptyTotals();
    const byModel: Record<string, UsageTotals> = {};

    for (const row of rows) {
      const ts = String(row[0] ?? "");
      if (!ts.startsWith(day)) continue;
      if (String(row[2] ?? "assistant") !== "assistant") continue;

      const model = String(row[3] ?? "unknown");
      byModel[model] ??= emptyTotals();

      addTotals(totals, row);
      addTotals(byModel[model], row);
    }

    return { totals, byModel };
  } catch (error) {
    logger.warn({ err: error }, "Gagal membaca usage dari Sheets");
    return null;
  }
}

/** Dipakai saat shutdown supaya log terakhir tidak hilang. */
export async function closeSheets(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await flushSheets();
}
