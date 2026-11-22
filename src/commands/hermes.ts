import type { Bot, Context } from "grammy";
import { config } from "../config.js";
import { runHermes } from "../hermes.js";
import { chunkText } from "../util/text.js";
import { logger } from "../util/logger.js";

function promptFrom(ctx: Context): string {
  const direct = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (direct) return direct;

  const replied = ctx.message?.reply_to_message;
  if (replied && "text" in replied && typeof replied.text === "string") {
    return replied.text.trim();
  }
  return "";
}

export function registerHermes(bot: Bot): void {
  bot.command("hermes", async (ctx) => {
    const prompt = promptFrom(ctx);
    if (!prompt) {
      await ctx.reply(
        "Usage: /hermes <tugas>\nContoh: /hermes rangkum catatan ini jadi 5 poin",
      );
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const answer = await runHermes(prompt);
      const parts = chunkText(answer, config.hermes.maxChars).slice(0, 5);
      for (const part of parts) await ctx.reply(part);
    } catch (error) {
      logger.error({ err: error }, "Command /hermes gagal");
      const message = (error as Error)?.message ?? String(error);
      await ctx.reply(`⚠️ Hermes gagal: ${message.slice(0, 500)}`);
    }
  });
}
