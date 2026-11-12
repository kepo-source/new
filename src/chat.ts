import type { Context } from "grammy";
import { SYSTEM_PROMPT } from "./config.js";
import { appendAssistant, appendUser, getHistory } from "./memory.js";
import { otherProvider, providers } from "./providers/index.js";
import type { ChatResponse, ProviderName } from "./providers/types.js";
import { pickProvider } from "./router.js";
import { logExchange } from "./sheets.js";
import { estimateCost, formatUsd } from "./util/cost.js";
import { errorMessage } from "./util/errors.js";
import { logger } from "./util/logger.js";
import { chunkText } from "./util/text.js";
import { hasBudget, record, seedUsage } from "./usage.js";

const MAX_PROMPT_CHARS = 6000;

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

  if (primaryName === "grok" && !hasBudget()) {
    primaryName = "gemini";
    note = "⚠️ Budget harian habis, request dialihkan ke Gemini.\n\n";
  }

  const primary = providers[primaryName];
  const fallbackName = otherProvider(primaryName);
  const fallback = providers[fallbackName];

  const request = {
    messages: [
      ...getHistory(chatId),
      { role: "user" as const, content: prompt },
    ],
    system: SYSTEM_PROMPT,
  };

  await safeTyping(ctx);

  let response: ChatResponse;
  let usedName: ProviderName = primaryName;
  let usedModel = primary.model;

  try {
    response = await primary.chat(request);
  } catch (primaryError) {
    logger.warn(
      { err: primaryError, provider: primary.name },
      "Provider utama gagal, coba fallback",
    );

    if (fallbackName === "grok" && !hasBudget()) {
      await ctx.reply(
        `❌ ${primary.name} gagal dan budget Grok sudah habis.\n${errorMessage(primaryError)}`,
      );
      return;
    }

    try {
      response = await fallback.chat(request);
      usedName = fallbackName;
      usedModel = fallback.model;
      note += `⚠️ ${primary.name} gagal, fallback ke ${fallback.name}.\n\n`;
    } catch (fallbackError) {
      logger.error(
        { err: fallbackError, provider: fallback.name },
        "Fallback juga gagal",
      );
      await ctx.reply(
        `❌ Dua provider gagal.\n\n${primary.name}: ${errorMessage(primaryError)}\n${fallback.name}: ${errorMessage(fallbackError)}`,
      );
      return;
    }
  }

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
