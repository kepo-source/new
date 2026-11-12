import type { Bot, Context } from "grammy";
import { runChat } from "../chat.js";

function commandPrompt(ctx: Context): string {
  return typeof ctx.match === "string" ? ctx.match.trim() : "";
}

export function registerAsk(bot: Bot): void {
  bot.command("ask", async (ctx) => {
    await runChat(ctx, commandPrompt(ctx));
  });

  bot.command("fast", async (ctx) => {
    await runChat(ctx, commandPrompt(ctx), {
      forced: "gemini",
      routeLabel: "manual:gemini",
    });
  });

  bot.command("deep", async (ctx) => {
    await runChat(ctx, commandPrompt(ctx), {
      forced: "grok",
      routeLabel: "manual:grok",
    });
  });

  // Pesan teks biasa (bukan command) → auto-route
  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) {
      await next();
      return;
    }
    await runChat(ctx, text);
  });
}
