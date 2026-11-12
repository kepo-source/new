import type { Bot, Context } from "grammy";
import { runChat } from "../chat.js";
import { config } from "../config.js";

function commandPrompt(ctx: Context): string {
  return typeof ctx.match === "string" ? ctx.match.trim() : "";
}

export function registerAsk(bot: Bot): void {
  bot.command("ask", async (ctx) => {
    await runChat(ctx, commandPrompt(ctx));
  });

  bot.command("fast", async (ctx) => {
    await runChat(ctx, commandPrompt(ctx), {
      forced: config.defaultProvider,
      routeLabel: `manual:${config.defaultProvider}`,
    });
  });

  bot.command("deep", async (ctx) => {
    await runChat(ctx, commandPrompt(ctx), {
      forced: config.deepProvider,
      routeLabel: `manual:${config.deepProvider}`,
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
