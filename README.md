# 🧠 second-brain

Bot Telegram **second brain** dengan **multi-model router**: model cepat buat kerja sehari-hari, model deep buat analisa berat, dan semua pemakaian dicatat ke **Google Sheets**.

Bot ini **khusus xKiro** — provider lain sudah dihapus. Tiga key dipakai bergiliran:

- **xKiro** (api.xkiro.com) — 3 akun/key: `xkiro` → `xkirov2` → `xkirov3` (OpenAI-compatible, model `vendor/model`)

Kalau semua key kosong, bot **menolak start** dengan error yang jelas (tidak ada fallback diam-diam). Isi minimal satu key; key ke-2/ke-3 sangat disarankan biar bot nggak berhenti saat free tier kena rate limit.

Ada juga **Hermes Agent** (Nous Research) lewat command `/hermes <tugas>`. Agent-nya memakai endpoint xKiro yang sama, jadi tidak perlu key baru. Toolset sengaja dimatikan — agent cuma berpikir & menjawab, tidak menjalankan shell/file dari Telegram.

```
Telegram ──▶ grammY (Node/TS)
                 │
                 ├─ AuthGuard (whitelist chat ID)
                 ├─ Router ──▶ default provider (xKiro)
                 │        └──▶ deep provider (xKiro)
                 ├─ Fallback: xKiro → xKiro2 → xKiro3
                 └─ Logger (queue) ──▶ Google Sheets
```

## Fitur

- Chat biasa langsung dijawab, model dipilih otomatis.
- `/fast` pakai model default, `/deep` pakai model deep, `/banding` dua-duanya sekaligus.
- Fallback otomatis: kalau satu key kena rate limit/error, request langsung dialihkan ke key xKiro berikutnya (xKiro → xKiro 2 → xKiro 3).
- Provider yang kena 401/403 otomatis cooldown 15 menit (429 cooldown 60 detik), jadi chat berikutnya nggak nunggu provider rusak.
- Konteks 6 putaran terakhir per chat (in-memory).
- Log lengkap ke Sheets: model, token, latency, biaya, alasan routing.
- Budget harian sebagai laporan biaya (`/stats`, `/budget`); tidak membatasi provider.
- `/stats` dan `/budget` buat pantau pemakaian.
- `/hermes <tugas>` menjalankan Hermes Agent dengan key xKiro bergiliran (tool mati, aman buat Telegram).
- Hanya chat ID yang di-whitelist yang bisa memakai bot.

## Command

| Command | Fungsi |
|---|---|
| _(chat biasa)_ | Auto-route |
| `/ask <teks>` | Auto-route |
| `/fast <teks>` | Paksa model default |
| `/deep <teks>` | Paksa model deep |
| `/banding <teks>` | Dua provider aktif paralel (mis. xKiro vs xKiro 2) |
| `/hermes <tugas>` | Hermes Agent via xKiro (tool dimatikan) |
| `/stats` | Pemakaian & biaya hari ini |
| `/budget` | Sisa budget harian |
| `/model` | Model aktif |
| `/reset` | Hapus konteks chat |
| `/help` | Bantuan |

## Struktur

```
src/
├── bot.ts              # entry: auth, command, health server, shutdown
├── config.ts           # env + system prompt
├── chat.ts             # orkestrasi chat + fallback + logging
├── hermes.ts           # runner Hermes Agent (config + rotasi key xKiro)
├── router.ts           # heuristik pemilihan model
├── memory.ts           # konteks per chat
├── sheets.ts           # queue log ke Google Sheets
├── usage.ts            # budget & counter harian
├── providers/          # xkiro.ts (3 key) + openai-compatible base
├── commands/           # admin, ask, banding, hermes, stats
└── util/               # logger, cost, date, text, errors
scripts/chat-id.ts      # bantu ambil chat ID
```

---

## 1. Prasyarat

- Node.js **22** (sesuai `engines` di package.json)
- Bot Telegram dari [@BotFather](https://t.me/BotFather)
- API key **xKiro** dari [xkiro.com](https://xkiro.com/) — provider utama; siapkan sampai 3 key (akun berbeda) buat rotasi
- Google Cloud project + **service account** dengan Sheets API aktif (opsional, buat logging)

## 2. Setup lokal

```bash
cd second-brain
npm install
cp .env.example .env
```

> ⚠️ Isi key di **`.env`**, bukan di `.env.example`. `.env` sudah di-gitignore; `.env.example` cuma template dan ikut ke-commit.

Isi `.env` minimal (contoh pakai 3 key xKiro):

```env
TELEGRAM_BOT_TOKEN=...
ALLOWED_CHAT_IDS=123456789
XKIRO_API_KEY=...
XKIRO_API_KEY_V2=...
XKIRO_API_KEY_V3=...
XKIRO_MODEL=mistralai/mistral-large-2512
DEFAULT_PROVIDER=xkiro
DEEP_PROVIDER=xkiro
```

Minimal satu key wajib diisi; kalau kosong semua, bot error saat start. Urutan fallback selalu `xkiro → xkirov2 → xkirov3` untuk key yang terisi.

Daftar model & harga: `https://api.xkiro.com/v1/models`. ID model wajib format `vendor/model` (mis. `mistralai/mistral-large-2512`). Bisa beda model per key lewat `XKIRO_MODEL_V2` / `XKIRO_MODEL_V3`.


Jalankan:

```bash
npm run dev
```

Lalu kirim pesan ke bot. Health check: `http://localhost:8080/health`.

### Ambil chat ID

1. Kirim pesan apa saja ke bot lo.
2. Pastikan bot **tidak sedang jalan** (getUpdates cuma boleh satu consumer).
3. Jalankan:

```bash
npm run chatid
```

Masukkan angka yang muncul ke `ALLOWED_CHAT_IDS`. Untuk grup, ID-nya negatif (contoh `-1001234567890`).

## 3. Setup Google Sheets (opsional tapi disarankan)

Kalau `GOOGLE_SHEETS_ID` / `GOOGLE_SA_B64` kosong, bot tetap jalan tapi log cuma di memori.

1. Buka [Google Cloud Console](https://console.cloud.google.com) → buat project.
2. **APIs & Services → Library** → cari **Google Sheets API** → **Enable**.
3. **IAM & Admin → Service Accounts → Create service account** (nama bebas, tanpa role khusus).
4. Buka service account → **Keys → Add key → JSON** → download.
5. Buat spreadsheet baru, lalu **Share** ke email service account (`...iam.gserviceaccount.com`) dengan role **Editor**.
6. Ambil spreadsheet ID dari URL:
   `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`
7. Encode JSON key jadi base64 satu baris:

```bash
# Linux/macOS
base64 -w0 service-account.json
# macOS (kalau -w0 tidak didukung)
base64 -i service-account.json | tr -d '\n'
```

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
```

8. Masukkan otomatis lewat script (validasi + tulis `.env` + cek akses):

```bash
npm run setup:sheets -- --file ./service-account.json \
  --sheet "https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit"
```

Script akan mencetak `client_email` kalau spreadsheet belum di-share, jadi lo bisa langsung invite.

Kalau mau isi manual:

```env
GOOGLE_SHEETS_ID=...
GOOGLE_SA_B64=...
```

Bot otomatis membuat tab `messages` + header-nya saat pertama jalan.

### Kolom tab `messages`

`ts | chat_id | role | model | prompt_chars | tokens_in | tokens_out | latency_ms | cost_usd | routed_by`

## 4. Deploy ke Railway (dari GitHub)

1. Buat repo GitHub baru, lalu push folder ini:

```bash
git remote add origin https://github.com/<username>/second-brain.git
git push -u origin main
```

2. Buka [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → pilih repo.
3. Tab **Variables**, copy semua isi `.env` (tanpa tanda kutip):
   - `TELEGRAM_BOT_TOKEN`
   - `ALLOWED_CHAT_IDS`
   - `XKIRO_API_KEY`, `XKIRO_API_KEY_V2`, `XKIRO_API_KEY_V3`, `XKIRO_MODEL`
   - `DEFAULT_PROVIDER`, `DEEP_PROVIDER`
   - `HERMES_ENABLED`, `HERMES_MODEL` (opsional; default sudah memakai xKiro)
   - `GOOGLE_SHEETS_ID`, `GOOGLE_SA_B64`
   - `DAILY_BUDGET_USD`, `TZ`, `LOG_LEVEL`
4. Railway otomatis build pakai `railway.json` + `railpack.json` dan start `npm start`. `railpack.json` juga meng-install Hermes Agent 0.19.0 ke `/app/.hermes-pkg` dan membuat wrapper `/app/.hermes-bin/hermes`, jadi `/hermes` langsung bisa dipakai.
5. Di Railway, generate domain publik (Settings → Networking → Generate Domain). Bot otomatis pakai **webhook** karena `RAILWAY_PUBLIC_DOMAIN` tersedia, jadi tidak ada lagi error `409 Conflict` dari polling ganda. Set `TELEGRAM_MODE=polling` kalau memang mau long polling.
6. Cek **Deployments → Logs**: harus muncul `Bot jalan` dengan `mode: "webhook"`.
7. Buka domain Railway + `/health` → `{"ok":true,"mode":"webhook",...}`.
8. Kirim `/ping` ke bot.

> Railway tidak punya free tier permanen. Plan Hobby (±$5/bulan) sudah lebih dari cukup untuk bot ini.
>
> Kalau build OOM di mesin kecil, set variable `NODE_OPTIONS=--max-old-space-size=2048`.

## 5. Konfigurasi

| Env | Wajib | Default | Keterangan |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | – | Token dari BotFather |
| `ALLOWED_CHAT_IDS` | ✅ | – | Pisahkan dengan koma |
| `TELEGRAM_MODE` | – | `auto` | `auto` = webhook kalau ada domain publik, kalau tidak polling |
| `PUBLIC_DOMAIN` | – | `RAILWAY_PUBLIC_DOMAIN` | Domain webhook (tanpa `https://`) |
| `TELEGRAM_WEBHOOK_SECRET` | – | turunan token | Secret header webhook, opsional |
| `TELEGRAM_WEBHOOK_PATH` | – | `/telegram` | Prefix path webhook |
| `XKIRO_API_KEY` | – | – | API key xKiro pertama (provider `xkiro`) |
| `XKIRO_API_KEY_V2` | – | – | API key xKiro ke-2 (provider `xkirov2`) |
| `XKIRO_API_KEY_V3` | – | – | API key xKiro ke-3 (provider `xkirov3`) |
| `XKIRO_MODEL` | – | `mistralai/mistral-large-2512` | Model xKiro (free tier, 256k context) |
| `XKIRO_MODEL_V2` / `XKIRO_MODEL_V3` | – | `XKIRO_MODEL` | Model khusus key ke-2/ke-3 |
| `XKIRO_BASE_URL` | – | `https://api.xkiro.com/v1` | OpenAI-compatible endpoint |
| `XKIRO_BASE_URL_V2` / `XKIRO_BASE_URL_V3` | – | `XKIRO_BASE_URL` | Endpoint khusus key ke-2/ke-3 |
| `HERMES_ENABLED` | – | `true` | Aktifkan command `/hermes` |
| `HERMES_API_KEY` | – | – | Key khusus Hermes; kalau kosong pakai 3 key xKiro di atas |
| `HERMES_MODEL` | – | `XKIRO_MODEL` | Model untuk Hermes Agent |
| `HERMES_BASE_URL` | – | `XKIRO_BASE_URL` | Endpoint OpenAI-compatible untuk Hermes |
| `HERMES_CONTEXT_LENGTH` | – | `256000` | Context window (minimal 64000) |
| `HERMES_TIMEOUT_MS` | – | `180000` | Batas waktu satu run agent |
| `HERMES_MAX_CHARS` | – | `3500` | Panjang maksimal per balasan Telegram |
| `HERMES_HOME` | – | `~/.hermes` | Data/config Hermes (Railway: `/app/.hermes`) |
| `HERMES_BIN` | – | auto | Path binary Hermes (Railway: `/app/.hermes-bin/hermes`) |
| `DEFAULT_PROVIDER` | – | `xkiro` → `xkirov2` → `xkirov3` | Provider buat chat biasa |
| `DEEP_PROVIDER` | – | `xkiro` → `xkirov2` → `xkirov3` | Provider buat `/deep` & keyword analisa |
| `GOOGLE_SHEETS_ID` | – | – | ID spreadsheet (boleh URL lengkap) |
| `GOOGLE_SA_B64` | – | – | Service account JSON, base64 |
| `DAILY_BUDGET_USD` | – | `1.00` | Patokan budget untuk laporan biaya (tidak membatasi provider) |
| `TZ` | – | `Asia/Jakarta` | Timezone untuk tanggal & reset budget |
| `LOG_LEVEL` | – | `info` | `debug` / `info` / `warn` / `error` |
| `PORT` | – | `8080` | Diisi otomatis oleh Railway |
| `HEALTH_PORT` | – | – | Opsional; menang atas `PORT`. Berguna kalau environment lokal sudah memakai `PORT` untuk hal lain (jangan diisi di Railway) |

> Minimal satu dari `XKIRO_API_KEY` (atau `_V2`/`_V3`) harus diisi, kalau tidak bot menolak start dengan pesan jelas. Urutan fallback selalu xKiro → xKiro 2 → xKiro 3 untuk key yang aktif.

### Ganti model

Cukup ubah env `XKIRO_MODEL` (atau `XKIRO_MODEL_V2`/`XKIRO_MODEL_V3`), lalu restart. Kalau nama model salah, provider akan error dan bot kasih tahu di chat/log. Cek model xKiro yang tersedia di `https://api.xkiro.com/v1/models` (tanpa key juga bisa).

### Ubah aturan routing

Edit `src/router.ts`, bagian `DEEP_PATTERNS`. Keyword yang match akan diarahkan ke `DEEP_PROVIDER`; sisanya `DEFAULT_PROVIDER`.

Default: semua lewat xKiro. Bisa set `DEFAULT_PROVIDER=xkirov2` atau `xkirov3` kalau mau mulai dari key lain. `DEEP_PROVIDER` juga bisa diarahkan ke key berbeda.

## 6. Biaya

Harga token di `src/util/cost.ts` adalah **perkiraan** (USD per 1 juta token) — sesuaikan dengan pricing terbaru provider. Budget harian dihitung dari tabel itu, jadi kalau harga berubah, update juga tabelnya.

Budget **tidak membatasi** provider apa pun — cuma dipakai buat laporan `/stats` dan `/budget`, biar kelihatan pemakaian harian. Semua provider tetap jalan walau budget sudah lewat. Model xKiro free tier harga tokennya `0` di tabel.

## 7. Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| `Missing env var` | `.env` belum lengkap / Variables Railway belum diisi |
| Bot diam saja | Chat ID belum masuk `ALLOWED_CHAT_IDS`, atau bot lain sedang polling dengan token sama |
| `409 Conflict` | Ada dua instance bot jalan dengan token sama |
| `DEFAULT_PROVIDER=xkiro tidak tersedia (key belum diisi)` | `XKIRO_API_KEY` kosong di service yang jalan. Pastikan Variable masuk ke **service yang benar** di Railway, lalu redeploy |
| `Minimal satu provider LLM harus diisi: XKIRO_API_KEY (atau _V2/_V3)` | Semua key xKiro kosong — bot sengaja berhenti supaya masalah kelihatan jelas |
| `xKiro HTTP 401/403` | Key xKiro salah/revoked — cek `XKIRO_API_KEY` / `_V2` / `_V3`, lalu buat key baru di xkiro.com |
| `xKiro HTTP 404` | Model harus format `vendor/model` dan tersedia; cek `XKIRO_MODEL` / `_V2` / `_V3` di `https://api.xkiro.com/v1/models` |
| `xKiro 429 / cooldown` | Free tier kena limit — bot otomatis coba key xKiro berikutnya |
| `/health` masih nunjukin provider lama | Masih ada service/proses lama yang jalan dengan token bot sama. Matikan service lama itu — dia bisa rebut webhook Telegram |
| `/hermes` bilang `command not found` | Binary Hermes belum ke-install. Di Railway pastikan `railpack.json` ikut ter-commit; lokal bisa set `HERMES_BIN=/path/ke/hermes` |
| `/hermes` timeout | Naikkan `HERMES_TIMEOUT_MS`; prompt terlalu berat atau xKiro sedang lambat |
| `/hermes` 401/429 | Semua key xKiro kena limit — coba lagi nanti atau isi `HERMES_API_KEY` / refresh key |
| `Sheets ... permission` | Spreadsheet belum di-share ke email service account (role Editor) |
| `Sheets ... parse range` | Tab `messages` belum ada — bot harus jalan sekali dengan akses Sheets yang benar |
| `GOOGLE_SA_B64 bukan JSON base64` | Jangan paste isi file mentah ke `.env`. Harus **base64 satu baris**: `base64 -w0 service-account.json` |
| `Sheets ... not found` / `permission` | `GOOGLE_SHEETS_ID` harus ID 44 karakter dari URL spreadsheet (bukan nama tab), dan spreadsheet sudah di-share ke `client_email` service account |
| Log Sheets telat | Normal: ditulis per batch (10 baris / 30 detik) supaya hemat quota. `/stats` bisa belum menghitung log yang masih di queue |
| `npm run chatid` kosong | Kirim pesan ke bot dulu, dan matikan bot sementara |

## 8. Keamanan

- `.env` masuk `.gitignore`; key hanya di Railway Variables.
- Semua pesan dari chat ID yang tidak di-whitelist diabaikan tanpa balasan.
- Log tidak menyimpan isi lengkap prompt kecuali `prompt_chars` (jumlah karakter).
- `/hermes` dijalankan dengan `--toolsets=` (tanpa terminal/file/browser) dan API key hanya dilewatkan lewat environment, tidak ditulis ke `config.yaml`.
- Jangan commit service-account JSON.
- Health endpoint hanya mengembalikan status, tanpa data sensitif.

## 9. Roadmap

- [ ] `/note`, `/cari`, `/rekap` (second brain penuh)
- [ ] Voice note → transkrip via xKiro/endpoint audiotranskrip
- [ ] Foto/screenshot → vision via xKiro
- [ ] SQLite + Railway Volume untuk konteks permanen
- [ ] Webhook mode (opsional, lebih hemat resource)
- [ ] OpenCode tool: `/code <task>` untuk eksekusi coding dari Telegram

## Lisensi

MIT
