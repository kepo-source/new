import type { Bot } from "grammy";
import { config } from "../config.js";
import { clearHistory, historySize } from "../memory.js";
import { providers } from "../providers/index.js";

export function registerAdmin(bot: Bot): void {
  bot.command("start", async (ctx) => {
    const name = ctx.from?.first_name ?? "bro";
    await ctx.reply(
      [
        `Halo ${name} 👋`,
        "",
        "Gw second brain lo: satu bot, dua otak (Gemini + Grok), log ke Google Sheets.",
        "",
        "Chat biasa → auto-route.",
        "/ask <teks> → auto",
        "/fast <teks> → paksa Gemini",
        "/deep <teks> → paksa Grok",
        "/banding <teks> → dua model sekaligus",
        "/stats → pemakaian & biaya hari ini",
        "/budget → sisa budget",
        "/model → model aktif",
        "/reset → hapus konteks chat",
        "/help → bantuan",
      ].join("\n"),
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "📖 Command:",
        "/ask /fast /deep /banding <teks>",
        "/stats /budget /model /reset",
        "",
        "Tip: kirim pesan biasa juga bisa — nanti otomatis dipilih modelnya.",
      ].join("\n"),
    );
  });

  bot.command("ping", async (ctx) => {
    const started = Date.now();
    await ctx.reply(`pong 🏓 (${Date.now() - started}ms)`);
  });

  bot.command("model", async (ctx) => {
    await ctx.reply(
      [
        "🧠 Model aktif:",
        `• Gemini → ${providers.gemini.model}`,
        `• Grok → ${providers.grok.model}`,
        "",
        `Auto-route: Grok untuk analisa/strategi/prediksi, sisanya Gemini.`,
        `Budget harian: $${config.budgetUsd.toFixed(2)}`,
      ].join("\n"),
    );
  });

  bot.command("reset", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const size = historySize(chatId);
    clearHistory(chatId);
    await ctx.reply(`🧹 Konteks dihapus (${size} pesan). Mulai dari nol.`);
  });
}
