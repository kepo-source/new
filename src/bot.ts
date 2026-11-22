import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Bot } from "grammy";
import { config, configWarnings } from "./config.js";
import { availableProviders, getProvider } from "./providers/index.js";
import { registerAdmin } from "./commands/admin.js";
import { registerAsk } from "./commands/ask.js";
import { registerBanding } from "./commands/banding.js";
import { registerHermes } from "./commands/hermes.js";
import { registerStats } from "./commands/stats.js";
import { closeSheets, initSheets, sheetsReady } from "./sheets.js";
import { logger } from "./util/logger.js";
import { seedUsage } from "./usage.js";

const bot = new Bot(config.telegramToken);

// === Mode koneksi: webhook (produksi) atau long polling (lokal) ===
const webhookSecret =
  config.telegram.webhookSecret ||
  createHash("sha256")
    .update(`${config.telegramToken}:webhook`)
    .digest("hex")
    .slice(0, 40);

const useWebhook =
  config.telegram.mode === "webhook" ||
  (config.telegram.mode !== "polling" && Boolean(config.telegram.publicDomain));

const webhookPath = `${config.telegram.webhookPath.replace(/\/$/, "")}/${webhookSecret}`;
const publicDomain = config.telegram.publicDomain;
const webhookUrl = publicDomain ? `https://${publicDomain}${webhookPath}` : "";

if (config.telegram.mode === "webhook" && !webhookUrl) {
  throw new Error(
    "TELEGRAM_MODE=webhook butuh PUBLIC_DOMAIN atau RAILWAY_PUBLIC_DOMAIN.",
  );
}

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
registerHermes(bot);

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

// === Health server + endpoint webhook Telegram ===
async function handleWebhook(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const provided = request.headers["x-telegram-bot-api-secret-token"];
  if (provided !== webhookSecret) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "unauthorized" }));
    return;
  }

  try {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 1_000_000) throw new Error("body terlalu besar");
    }
    const update = JSON.parse(raw);
    await bot.handleUpdate(update);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  } catch (error) {
    // Selalu balas 200 supaya Telegram tidak mengirim ulang terus-menerus.
    logger.error({ err: error }, "Webhook gagal memproses update");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  }
}

const healthServer = createServer((request, response) => {
  if (useWebhook && request.method === "POST" && request.url === webhookPath) {
    void handleWebhook(request, response);
    return;
  }

  if (request.url === "/health" || request.url === "/") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        uptimeSec: Math.round(process.uptime()),
        mode: useWebhook ? "webhook" : "polling",
        providers: availableProviders.map((name) => ({
          name,
          model: getProvider(name).model,
          default: name === config.defaultProvider,
          deep: name === config.deepProvider,
        })),
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

healthServer.on("error", (error) => {
  logger.error(
    { err: error, port: config.port },
    "Health server gagal listen — port dipakai proses lain? Set HEALTH_PORT ke port lain.",
  );
  process.exit(1);
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
for (const warning of configWarnings) {
  logger.warn(warning);
}

// === Bootstrap ===
await initSheets();
await seedUsage();

try {
  await bot.api.setMyCommands([
    { command: "ask", description: "Tanya (auto pilih model)" },
    { command: "fast", description: "Model default (cepat/murah)" },
    { command: "deep", description: "Model deep (analisa)" },
    { command: "banding", description: "Bandingin dua model" },
    { command: "hermes", description: "Jalankan Hermes Agent" },
    { command: "stats", description: "Pemakaian & biaya hari ini" },
    { command: "budget", description: "Sisa budget harian" },
    { command: "model", description: "Model yang aktif" },
    { command: "reset", description: "Hapus konteks chat" },
    { command: "help", description: "Bantuan" },
  ]);
} catch (error) {
  logger.warn({ err: error }, "Gagal set command menu");
}

const MAX_START_ATTEMPTS = 8;

function isRetryableStartError(error: unknown): boolean {
  const message = (error as Error)?.message ?? String(error);
  return /409|Conflict|terminated by other getUpdates|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|ECONNRESET/i.test(
    message,
  );
}

async function startBot(attempt = 1): Promise<void> {
  try {
    await bot.start({
      onStart: (info) => {
        logger.info(
          {
            bot: info.username,
            allowedChatIds: config.allowedChatIds.size,
            sheets: sheetsReady(),
            providers: availableProviders,
            defaultProvider: config.defaultProvider,
            deepProvider: config.deepProvider,
            budgetUsd: config.budgetUsd,
          },
          "Bot jalan",
        );
      },
    });
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    const name = (error as Error)?.name ?? "Error";
    logger.error(
      { err: error, attempt },
      `Bot berhenti: ${name}: ${message.slice(0, 300)}`,
    );

    if (isRetryableStartError(error) || attempt < MAX_START_ATTEMPTS) {
      const delayMs = Math.min(60_000, 5_000 * attempt);
      logger.warn(
        { attempt, delayMs },
        "Error sementara (409/jaringan) — coba start ulang",
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return startBot(attempt + 1);
    }

    process.exit(1);
  }
}

if (useWebhook) {
  await bot.init();
  await bot.api.setWebhook(webhookUrl, {
    secret_token: webhookSecret,
    drop_pending_updates: false,
  });
  logger.info(
    {
      bot: bot.botInfo.username,
      allowedChatIds: config.allowedChatIds.size,
      sheets: sheetsReady(),
      providers: availableProviders,
      defaultProvider: config.defaultProvider,
      deepProvider: config.deepProvider,
      budgetUsd: config.budgetUsd,
      mode: "webhook",
      path: `${config.telegram.webhookPath}/***`,
    },
    "Bot jalan",
  );
} else {
  void startBot();
}
