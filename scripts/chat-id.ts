import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

if (!token) {
  console.error("❌ TELEGRAM_BOT_TOKEN belum diisi di .env");
  process.exit(1);
}

interface TelegramUpdate {
  message?: {
    chat?: {
      id: number;
      type: string;
      title?: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
  channel_post?: {
    chat?: {
      id: number;
      type: string;
      title?: string;
      username?: string;
    };
  };
}

async function main(): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates`,
  );
  const data = (await response.json()) as {
    ok: boolean;
    description?: string;
    result?: TelegramUpdate[];
  };

  if (!data.ok) {
    console.error(`❌ Telegram error: ${data.description ?? "unknown"}`);
    process.exit(1);
  }

  const chats = new Map<number, string>();

  for (const update of data.result ?? []) {
    const chat = update.message?.chat ?? update.channel_post?.chat;
    if (!chat) continue;

    const name =
      chat.title ??
      [chat.first_name, chat.last_name].filter(Boolean).join(" ") ??
      chat.username ??
      chat.type;

    chats.set(chat.id, name);
  }

  if (chats.size === 0) {
    console.log(
      "Belum ada pesan. Kirim pesan dulu ke bot lo di Telegram, lalu jalankan lagi.",
    );
    console.log(
      "Catatan: kalau bot lagi jalan (Railway/lokal), matikan dulu karena getUpdates cuma boleh satu consumer.",
    );
    return;
  }

  console.log("Chat ID yang ketemu:\n");
  for (const [id, name] of chats) {
    console.log(`  ${id}  →  ${name}`);
  }
  console.log("\nMasukkan ke ALLOWED_CHAT_IDS (boleh lebih dari satu, pisah koma).");
}

main().catch((error) => {
  console.error("❌ Gagal:", error);
  process.exit(1);
});
