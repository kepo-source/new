import type { Context } from "grammy";
import { SYSTEM_PROMPT } from "./config.js";
import { appendAssistant, appendUser, getHistory } from "./memory.js";
import {
  availableProviders,
  getProvider,
  providerLabel,
} from "./providers/index.js";
import type { ChatResponse, ProviderName } from "./providers/types.js";
import { pickProvider } from "./router.js";
import { logExchange } from "./sheets.js";
import { estimateCost, formatUsd } from "./util/cost.js";
import { errorMessage } from "./util/errors.js";
import { logger } from "./util/logger.js";
import { redactString } from "./util/redact.js";
import { chunkText, truncate } from "./util/text.js";
import { hasBudget, record, seedUsage } from "./usage.js";

const MAX_PROMPT_CHARS = 6000;

/** Urutan fallback: murah dan umum dulu. */
const PREFERENCE: ProviderName[] = ["gemini", "groq", "grok"];

/** Budget harian hanya menahan provider mahal (Grok xAI). */
function budgetBlocked(name: ProviderName): boolean {
  return name === "grok" && !hasBudget();
}

function buildOrder(primary: ProviderName): ProviderName[] {
  return [
    primary,
    ...PREFERENCE.filter(
      (name) => name !== primary && availableProviders.includes(name),
    ),
  ];
}

export async function safeTyping(ctx: Context): Promise<void> {
  try {
    await ctx.replyWithChatAction("typing");
  } catch {
    // indikator typing bukan hal krusial
  }
}

export async function sendLong(ctx: Context, text: string): Promise<void> {
  const chatId = ctx.chat?.id;
  const parts = chunkText(text);

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part) continue;

    if (index === 0) {
      await ctx.reply(part);
    } else if (chatId) {
      await ctx.api.sendMessage(chatId, part);
    }
  }
}

function footer(response: ChatResponse, cost: number, route: string): string {
  const seconds = (response.latencyMs / 1000).toFixed(1);
  return `\n\n———\n🤖 ${response.model} · ${seconds}s · ${formatUsd(cost)} · ${route}`;
}

export interface RunChatOptions {
  forced?: ProviderName;
  routeLabel?: string;
}

export async function runChat(
  ctx: Context,
  rawPrompt: string,
  options: RunChatOptions = {},
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const prompt = rawPrompt.trim();
  if (!prompt) {
    await ctx.reply(
      "Kirim pertanyaannya ya. Contoh:\n/ask jelasin konsep RAG simpel\n/deep analisa trade-off SQLite vs Postgres",
    );
    return;
  }

  if (prompt.length > MAX_PROMPT_CHARS) {
    await ctx.reply(
      `Prompt kepanjangan (${prompt.length} karakter, maks ${MAX_PROMPT_CHARS}). Ringkas dulu ya.`,
    );
    return;
  }

  await seedUsage();

  const decision = options.forced
    ? { provider: options.forced, reason: "explicit" }
    : pickProvider(prompt);

  let primaryName: ProviderName = decision.provider;
  let note = "";

  if (budgetBlocked(primaryName)) {
    const alternative = buildOrder(primaryName).find(
      (name) => !budgetBlocked(name) && name !== primaryName,
    );

    if (alternative) {
      note = `⚠️ Budget harian habis, request dialihkan ke ${providerLabel(alternative)}.\n\n`;
      primaryName = alternative;
    } else {
      note =
        "⚠️ Budget harian sudah lewat, tapi Grok satu-satunya provider aktif.\n\n";
    }
  }

  const request = {
    messages: [
      ...getHistory(chatId),
      { role: "user" as const, content: prompt },
    ],
    system: SYSTEM_PROMPT,
  };

  await safeTyping(ctx);

  const order = buildOrder(primaryName);
  const allowed = order.filter((name) => !budgetBlocked(name));
  const tryOrder = allowed.length > 0 ? allowed : order;

  let response: ChatResponse | undefined;
  let usedName: ProviderName = primaryName;
  const failures: string[] = [];

  for (const name of tryOrder) {
    try {
      response = await getProvider(name).chat(request);
      usedName = name;
      break;
    } catch (error) {
      failures.push(
        `${providerLabel(name)}: ${truncate(redactString(errorMessage(error)), 220)}`,
      );
      logger.warn({ err: error, provider: name }, "Provider gagal, coba berikutnya");
    }
  }

  if (!response) {
    await ctx.reply(
      `❌ Semua provider gagal.\n\n${failures.join("\n") || "Tidak ada provider aktif."}`,
    );
    return;
  }

  if (usedName !== primaryName) {
    note += `⚠️ ${providerLabel(primaryName)} gagal, fallback ke ${providerLabel(usedName)}.\n\n`;
  }

  const usedModel = response.model;
  const cost = estimateCost(usedModel, response.tokensIn, response.tokensOut);

  record(usedModel, response.tokensIn, response.tokensOut, cost);
  appendUser(chatId, prompt);
  appendAssistant(chatId, response.text);
  logExchange({
    chatId,
    model: usedModel,
    promptChars: prompt.length,
    tokensIn: response.tokensIn,
    tokensOut: response.tokensOut,
    latencyMs: response.latencyMs,
    costUsd: cost,
    routedBy: `${decision.reason}/used:${usedName}`,
  });

  const routeLabel = options.routeLabel ?? decision.reason;
  await sendLong(ctx, note + response.text + footer(response, cost, routeLabel));
}
