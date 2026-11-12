import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";

/**
 * Bantu setup Google Sheets dalam satu perintah:
 *
 *   npm run setup:sheets -- --file ./service-account.json \
 *     --sheet "https://docs.google.com/spreadsheets/d/<ID>/edit"
 *
 * Script ini:
 * 1. validasi file service account,
 * 2. encode ke base64 satu baris,
 * 3. tulis GOOGLE_SHEETS_ID + GOOGLE_SA_B64 ke .env,
 * 4. cek akses ke spreadsheet (butuh sudah di-share ke client_email).
 */

interface ServiceAccount {
  client_email?: string;
  private_key?: string;
  project_id?: string;
}

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

/** Terima ID spreadsheet mentah maupun URL lengkap. */
function normalizeSheetId(raw: string): string {
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return (match?.[1] ?? raw).trim();
}

function upsertEnv(updates: Record<string, string>): void {
  const file = path.resolve(".env");
  const lines = fs.existsSync(file)
    ? fs.readFileSync(file, "utf8").split(/\r?\n/)
    : [];

  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
    const index = lines.findIndex((line) => pattern.test(line));
    const line = `${key}=${value}`;

    if (index >= 0) lines[index] = line;
    else lines.push(line);
  }

  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
    lines.pop();
  }

  fs.writeFileSync(file, `${lines.join("\n")}\n`);
  fs.chmodSync(file, 0o600);
}

function readServiceAccount(filePath: string): {
  credentials: ServiceAccount;
  base64: string;
} {
  const absolute = path.resolve(filePath);

  if (!fs.existsSync(absolute)) {
    throw new Error(`File tidak ditemukan: ${absolute}`);
  }

  const raw = fs.readFileSync(absolute, "utf8").trim();
  let credentials: ServiceAccount;

  try {
    credentials = JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error(
      "File itu bukan JSON yang valid. Pastikan pakai file key service account dari Google Cloud, bukan file lain.",
    );
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error(
      "JSON tidak punya client_email/private_key. Pastikan itu key service account (JSON), bukan OAuth client.",
    );
  }

  const base64 = Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\n/g, "");

  return { credentials, base64 };
}

async function verifyAccess(
  credentials: ServiceAccount,
  spreadsheetId: string,
): Promise<void> {
  const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const title = meta.data.properties?.title ?? "(tanpa judul)";
  const tabs = (meta.data.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter(Boolean)
    .join(", ");

  console.log(`✅ Akses OK ke spreadsheet: "${title}"`);
  console.log(`   Tab: ${tabs || "(belum ada)"}`);
}

async function main(): Promise<void> {
  const filePath = arg("file");
  const sheetArg = arg("sheet");

  if (!filePath && !sheetArg) {
    console.log(
      [
        "Cara pakai:",
        "  npm run setup:sheets -- --file ./service-account.json \\",
        '    --sheet "https://docs.google.com/spreadsheets/d/<ID>/edit"',
        "",
        "Kalau .env sudah berisi GOOGLE_SHEETS_ID + GOOGLE_SA_B64, cukup:",
        "  npm run setup:sheets",
      ].join("\n"),
    );
    return;
  }

  let credentials: ServiceAccount | undefined;
  let base64: string | undefined;
  const updates: Record<string, string> = {};

  if (filePath) {
    const result = readServiceAccount(filePath);
    credentials = result.credentials;
    base64 = result.base64;
    updates.GOOGLE_SA_B64 = base64;
    console.log(`✅ Service account valid: ${credentials.client_email}`);
  }

  if (sheetArg) {
    const id = normalizeSheetId(sheetArg);
    updates.GOOGLE_SHEETS_ID = id;
    console.log(`✅ Spreadsheet ID: ${id} (${id.length} karakter)`);
  }

  if (Object.keys(updates).length > 0) {
    upsertEnv(updates);
    console.log("✅ .env diperbarui.");
  }

  const spreadsheetId =
    updates.GOOGLE_SHEETS_ID ?? process.env.GOOGLE_SHEETS_ID?.trim();

  if (!credentials) {
    const envB64 = process.env.GOOGLE_SA_B64?.trim();
    if (!envB64) {
      throw new Error(
        "GOOGLE_SA_B64 kosong. Jalankan dengan --file ./service-account.json.",
      );
    }
    try {
      credentials = JSON.parse(
        Buffer.from(envB64, "base64").toString("utf8"),
      ) as ServiceAccount;
    } catch {
      throw new Error(
        "GOOGLE_SA_B64 di .env bukan base64 JSON yang valid. Jalankan ulang dengan --file.",
      );
    }
  }

  if (!spreadsheetId) {
    throw new Error(
      "GOOGLE_SHEETS_ID kosong. Tambahkan --sheet <URL atau ID spreadsheet>.",
    );
  }

  console.log("\nCek akses ke spreadsheet...");

  try {
    await verifyAccess(credentials, spreadsheetId);
  } catch (error) {
    const message = (error as Error).message;
    console.error(`\n❌ Gagal akses spreadsheet: ${message}`);

    if (/DECODER|private key|PEM/i.test(message)) {
      console.error(
        "\nPrivate key di file JSON kelihatan rusak. Download ulang key service account (Keys → Add key → JSON) dan jangan edit isinya.",
      );
    } else {
      console.error(
        [
          "",
          "Paling sering karena spreadsheet belum di-share ke service account.",
          `Buka spreadsheet → Share → tambahkan: ${credentials.client_email ?? "(client_email tidak ada)"} sebagai Editor.`,
          "",
          "Pastikan juga Google Sheets API sudah aktif di project Google Cloud yang sama.",
        ].join("\n"),
      );
    }

    process.exit(1);
  }

  console.log("\n🎉 Sheets siap dipakai. Restart bot supaya logging aktif.");
}

main().catch((error) => {
  console.error(`❌ ${(error as Error).message}`);
  process.exit(1);
});
