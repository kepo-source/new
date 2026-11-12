import type { Bot, Context } from "grammy";
import { SYSTEM_PROMPT, config } from "../config.js";
import { appendAssistant, appendUser, getHistory } from "../memory.js";
import {
  PROVIDER_EMOJI,
  getProvider,
  providerLabel,
} from "../providers/index.js";
import type { ChatResponse, ProviderName } from "../providers/types.js";
import { logExchange } from "../sheets.js";
import { estimateCost, formatUsd } from "../util/cost.js";
import { errorMessage } from "../util/errors.js";
import { logger } from "../util/logger.js";
import { truncate } from "../util/text.js";
import { hasBudget, record, seedUsage } from "../usage.js";
import { isCoolingDown, markProviderFailure } from "../cooldown.js";
import { ProviderError } from "../util/errors.js";
import { safeTyping, sendLong } from "../chat.js";

function section(
  name: ProviderName,
  response: ChatResponse,
  cost: number,
): string {
  const seconds = (response.latencyMs / 1000).toFixed(1);
  return [
    `${PROVIDER_EMOJI[name]} ${providerLabel(name).toUpperCase()} · ${response.model}`,
    response.text,
    `· ${seconds}s · ${formatUsd(cost)}`,
  ].join("\n");
}

export function registerBanding(bot: Bot): void {
  bot.command("banding", async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const prompt = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (!prompt) {
      await ctx.reply(
        "Contoh: /banding mana yang lebih cocok buat project kecil, SQLite atau Postgres?",
      );
      return;
    }

    const pair: ProviderName[] = [config.defaultProvider];
    if (config.deepProvider !== config.defaultProvider) {
      pair.push(config.deepProvider);
    }

    if (pair.length < 2) {
      await ctx.reply(
        `🆚 /banding butuh dua provider berbeda.\nSekarang cuma aktif: ${providerLabel(config.defaultProvider)} (${getProvider(config.defaultProvider).model}).\n\nTambah key Gemini atau xAI biar bisa banding.`,
      );
      return;
    }

    await seedUsage();
    await safeTyping(ctx);

    const request = {
      messages: [
        ...getHistory(chatId),
        { role: "user" as const, content: prompt },
      ],
      system: SYSTEM_PROMPT,
    };

    const skipped: ProviderName[] = [];
    const cooling: ProviderName[] = [];
    const tasks: Array<{
      name: ProviderName;
      promise: Promise<ChatResponse>;
    }> = [];

    for (const name of pair) {
      if (isCoolingDown(name)) {
        cooling.push(name);
        continue;
      }
      if (name === "grok" && !hasBudget()) {
        skipped.push(name);
        continue;
      }
      tasks.push({ name, promise: getProvider(name).chat(request) });
    }

    if (tasks.length === 0) {
      await ctx.reply(
        "⚠️ Tidak ada provider yang bisa dipakai sekarang (budget habis / provider cooldown).",
      );
      return;
    }

    const settled = await Promise.allSettled(tasks.map((task) => task.promise));

    const blocks: string[] = ["🆚 BANDING", ""];
    let successCount = 0;
    const compactHistory: string[] = [];

    settled.forEach((result, index) => {
      const task = tasks[index];
      if (!task) return;

      if (result.status === "fulfilled") {
        const response = result.value;
        const cost = estimateCost(
          response.model,
          response.tokensIn,
          response.tokensOut,
        );

        successCount += 1;
        record(response.model, response.tokensIn, response.tokensOut, cost);
        logExchange({
          chatId,
          model: response.model,
          promptChars: prompt.length,
          tokensIn: response.tokensIn,
          tokensOut: response.tokensOut,
          latencyMs: response.latencyMs,
          costUsd: cost,
          routedBy: "banding",
        });

        compactHistory.push(
          `${providerLabel(task.name)}: ${truncate(response.text, 500)}`,
        );
        blocks.push(section(task.name, response, cost), "");
      } else {
        blocks.push(
          `${PROVIDER_EMOJI[task.name]} ${providerLabel(task.name).toUpperCase()}\n❌ gagal: ${errorMessage(result.reason)}`,
          "",
        );
        markProviderFailure(
          task.name,
          result.reason instanceof ProviderError
            ? result.reason.status
            : undefined,
        );
        logger.warn(
          { err: result.reason, provider: task.name },
          "Banding: salah satu provider gagal",
        );
      }
    });

    if (cooling.length > 0) {
      blocks.push(
        `⚠️ ${cooling.map((name) => providerLabel(name)).join(", ")} dilewati karena sedang cooldown (error sebelumnya).`,
      );
    }

    if (skipped.length > 0) {
      blocks.push(
        `⚠️ ${skipped.map((name) => providerLabel(name)).join(", ")} dilewati karena budget harian habis.`,
      );
    }

    if (successCount === 0) {
      await ctx.reply(blocks.join("\n").trim());
      return;
    }

    appendUser(chatId, prompt);
    appendAssistant(chatId, `[banding]\n${compactHistory.join("\n---\n")}`);

    await sendLong(ctx, blocks.join("\n").trim());
  });
}
