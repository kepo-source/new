import type { Bot, Context } from "grammy";
import { SYSTEM_PROMPT } from "../config.js";
import { appendAssistant, appendUser, getHistory } from "../memory.js";
import { providers } from "../providers/index.js";
import type { ChatResponse, ProviderName } from "../providers/types.js";
import { logExchange } from "../sheets.js";
import { estimateCost, formatUsd } from "../util/cost.js";
import { errorMessage } from "../util/errors.js";
import { logger } from "../util/logger.js";
import { truncate } from "../util/text.js";
import { hasBudget, record, seedUsage } from "../usage.js";
import { safeTyping, sendLong } from "../chat.js";

function section(
  emoji: string,
  name: string,
  response: ChatResponse,
  cost: number,
): string {
  const seconds = (response.latencyMs / 1000).toFixed(1);
  return [
    `${emoji} ${name} · ${response.model}`,
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

    await seedUsage();
    await safeTyping(ctx);

    const request = {
      messages: [
        ...getHistory(chatId),
        { role: "user" as const, content: prompt },
      ],
      system: SYSTEM_PROMPT,
    };

    const grokAllowed = hasBudget();
    const tasks: Array<{
      name: ProviderName;
      emoji: string;
      promise: Promise<ChatResponse>;
    }> = [
      {
        name: "gemini",
        emoji: "🟦",
        promise: providers.gemini.chat(request),
      },
    ];

    if (grokAllowed) {
      tasks.push({
        name: "grok",
        emoji: "🟧",
        promise: providers.grok.chat(request),
      });
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
          `${task.name}: ${truncate(response.text, 500)}`,
        );
        blocks.push(
          section(task.emoji, task.name.toUpperCase(), response, cost),
          "",
        );
      } else {
        blocks.push(
          `${task.emoji} ${task.name.toUpperCase()}\n❌ gagal: ${errorMessage(result.reason)}`,
          "",
        );
        logger.warn(
          { err: result.reason, provider: task.name },
          "Banding: salah satu provider gagal",
        );
      }
    });

    if (!grokAllowed) {
      blocks.push("⚠️ Grok dilewati karena budget harian habis.");
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
