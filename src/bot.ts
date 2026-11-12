import { createServer } from "node:http";
import { Bot } from "grammy";
import { config } from "./config.js";
import { registerAdmin } from "./commands/admin.js";
import { registerAsk } from "./commands/ask.js";
import { registerBanding } from "./commands/banding.js";
import { registerStats } from "./commands/stats.js";
import { closeSheets, initSheets, sheetsReady } from "./sheets.js";
import { logger } from "./util/logger.js";
import { seedUsage } from "./usage.js";

const bot = new Bot(config.telegramToken);

// === Auth guard: hanya chat ID yang di-whitelist ===
bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id;
  if (!chatId || !config.allowedChatIds.has(chatId)) {
    logger.warn(
      { chatId, username: ctx.from?.username },
      "Akses ditolak (chat ID tidak ada di ALLOWED_CHAT_IDS)",
    );
    return;
  }
  await next();
});

registerAdmin(bot);
registerBanding(bot);
registerStats(bot);
registerAsk(bot);

bot.catch(async (error) => {
  logger.error({ err: error.error }, "Unhandled bot error");

  try {
    const chatId = error.ctx.chat?.id;
    if (chatId && config.allowedChatIds.has(chatId)) {
      await error.ctx.reply(
        "⚠️ Ada error internal. Coba lagi sebentar, cek log kalau berulang.",
      );
    }
  } catch {
    // kalau gagal balas, cukup log saja
  }
});

// === Health server (dipakai Railway healthcheck) ===
const healthServer = createServer((request, response) => {
  if (request.url === "/health" || request.url === "/") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        uptimeSec: Math.round(process.uptime()),
        models: {
          gemini: config.gemini.model,
          grok: config.grok.model,
        },
      }),
    );
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: false, error: "not found" }));
});

healthServer.listen(config.port, () => {
  logger.info({ port: config.port }, "Health server listening");
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down...");

  try {
    await bot.stop();
  } catch {
    // abaikan
  }

  try {
    await closeSheets();
  } catch {
    // abaikan
  }

  healthServer.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

// === Peringatan konfigurasi yang sering bikin bingung ===
if (config.gemini.apiKey.startsWith("AQ.")) {
  logger.warn(
    "GEMINI_API_KEY berawalan 'AQ.' — format baru AI Studio yang sering ditolak Gemini API. Regenerate sampai dapat key 'AIza...'.",
  );
}

if (config.grok.apiKey.startsWith("gsk_")) {
  logger.warn(
    "XAI_API_KEY kelihatan seperti key Groq Cloud ('gsk_...'), bukan xAI ('xai-...'). Grok butuh key dari console.x.ai.",
  );
}

// === Bootstrap ===
await initSheets();
await seedUsage();

try {
  await bot.api.setMyCommands([
    { command: "ask", description: "Tanya (auto pilih model)" },
    { command: "fast", description: "Paksa Gemini (cepat)" },
    { command: "deep", description: "Paksa Grok (analisa)" },
    { command: "banding", description: "Bandingin Gemini vs Grok" },
    { command: "stats", description: "Pemakaian & biaya hari ini" },
    { command: "budget", description: "Sisa budget harian" },
    { command: "model", description: "Model yang aktif" },
    { command: "reset", description: "Hapus konteks chat" },
    { command: "help", description: "Bantuan" },
  ]);
} catch (error) {
  logger.warn({ err: error }, "Gagal set command menu");
}

bot.start({
  onStart: (info) => {
    logger.info(
      {
        bot: info.username,
        allowedChatIds: config.allowedChatIds.size,
        sheets: sheetsReady(),
        budgetUsd: config.budgetUsd,
      },
      "Bot jalan",
    );
  },
});
