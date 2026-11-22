# 🧠 second-brain

Bot Telegram **second brain** dengan **multi-model router**: model cepat buat kerja sehari-hari, model deep buat analisa berat, dan semua pemakaian dicatat ke **Google Sheets**.

Defaultnya pakai **xKiro** dengan 3 key yang dipakai bergiliran. Kalau ketiganya kena limit/error, baru pindah ke **Gemini**, lalu **Groq**:

- **xKiro** (api.xkiro.com) — provider utama, 3 akun/key: `xkiro` → `xkirov2` → `xkirov3` (OpenAI-compatible, model `vendor/model`)
- **Gemini** (Google AI Studio) — fallback ke-4
- **Groq** (Groq Cloud) — fallback terakhir (OpenAI-compatible)

Cukup punya satu key xKiro; key ke-2/ke-3 sangat disarankan biar bot nggak berhenti saat free tier kena rate limit. Gemini/Groq tetap bisa dipakai sebagai cadangan.

```
Telegram ──▶ grammY (Node/TS)
                 │
                 ├─ AuthGuard (whitelist chat ID)
                 ├─ Router ──▶ default provider (xKiro)
                 │        └──▶ deep provider (xKiro)
                 ├─ Fallback: xKiro → xKiro2 → xKiro3 → Gemini → Groq
                 └─ Logger (queue) ──▶ Google Sheets
```

## Fitur

- Chat biasa langsung dijawab, model dipilih otomatis.
- `/fast` pakai model default, `/deep` pakai model deep, `/banding` dua-duanya sekaligus.
- Fallback otomatis: kalau satu provider kena rate limit/error, request langsung dialihkan ke provider aktif berikutnya (xKiro → xKiro 2 → xKiro 3 → Gemini → Groq).
- Provider yang kena 401/403 otomatis cooldown 15 menit (429 cooldown 60 detik), jadi chat berikutnya nggak nunggu provider rusak.
- Konteks 6 putaran terakhir per chat (in-memory).
- Log lengkap ke Sheets: model, token, latency, biaya, alasan routing.
- Budget harian sebagai laporan biaya (`/stats`, `/budget`); tidak membatasi provider.
- `/stats` dan `/budget` buat pantau pemakaian.
- Hanya chat ID yang di-whitelist yang bisa memakai bot.

## Command

| Command | Fungsi |
|---|---|
| _(chat biasa)_ | Auto-route |
| `/ask <teks>` | Auto-route |
| `/fast <teks>` | Paksa model default |
| `/deep <teks>` | Paksa model deep |
| `/banding <teks>` | Dua provider aktif paralel (mis. xKiro vs xKiro 2) |
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
├── router.ts           # heuristik pemilihan model
├── memory.ts           # konteks per chat
├── sheets.ts           # queue log ke Google Sheets
├── usage.ts            # budget & counter harian
├── providers/          # xkiro.ts (3 key), gemini.ts, groq.ts (+ openai-compatible base)
├── commands/           # admin, ask, banding, stats
└── util/               # logger, cost, date, text, errors
scripts/chat-id.ts      # bantu ambil chat ID
```

---

## 1. Prasyarat

- Node.js **22** (sesuai `engines` di package.json)
- Bot Telegram dari [@BotFather](https://t.me/BotFather)
- API key **xKiro** dari [xkiro.com](https://xkiro.com/) — provider utama; siapkan sampai 3 key (akun berbeda) buat rotasi
- API key **Gemini** dari [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (format sekarang `AQ.…`) — opsional, cadangan
- API key **Groq** dari [console.groq.com](https://console.groq.com) — opsional, cadangan terakhir
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

Key yang kosong otomatis dilewati, jadi boleh isi satu dulu. Urutan fallback selalu `xkiro → xkirov2 → xkirov3 → gemini → groq` untuk provider yang keynya terisi.

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
   - `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_THINKING_LEVEL`
   - `GROQ_API_KEY`, `GROQ_MODEL`
   - `XKIRO_API_KEY`, `XKIRO_API_KEY_V2`, `XKIRO_API_KEY_V3`, `XKIRO_MODEL`
   - `DEFAULT_PROVIDER`, `DEEP_PROVIDER`
   - `GOOGLE_SHEETS_ID`, `GOOGLE_SA_B64`
   - `DAILY_BUDGET_USD`, `TZ`, `LOG_LEVEL`
4. Railway otomatis build pakai `railway.json` dan start `npm start`.
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
| `GEMINI_API_KEY` | – | – | API key Google AI Studio (format sekarang `AQ.…`; key lama `AIza…` hanya jalan kalau masih aktif) |
| `GEMINI_MODEL` | – | `gemini-3.5-flash-lite` | Model Gemini yang dipakai (paling cepat). `gemini-4-hydrogen` = lebih detail tapi lebih lambat |
| `GEMINI_THINKING_LEVEL` | – | `low` | `minimal` / `low` / `medium` / `high` / `xhigh`. `low` = paling cepat; Gemini 4 tidak mendukung `minimal` |
| `GROQ_API_KEY` | – | – | API key Groq Cloud (`gsk_...`) |
| `GROQ_MODEL` | – | `openai/gpt-oss-120b` | Model Groq yang dipakai |
| `GROQ_BASE_URL` | – | `https://api.groq.com/openai/v1` | OpenAI-compatible endpoint |
| `XKIRO_API_KEY` | – | – | API key xKiro pertama (provider `xkiro`) |
| `XKIRO_API_KEY_V2` | – | – | API key xKiro ke-2 (provider `xkirov2`) |
| `XKIRO_API_KEY_V3` | – | – | API key xKiro ke-3 (provider `xkirov3`) |
| `XKIRO_MODEL` | – | `mistralai/mistral-large-2512` | Model xKiro (free tier, 256k context) |
| `XKIRO_MODEL_V2` / `XKIRO_MODEL_V3` | – | `XKIRO_MODEL` | Model khusus key ke-2/ke-3 |
| `XKIRO_BASE_URL` | – | `https://api.xkiro.com/v1` | OpenAI-compatible endpoint |
| `XKIRO_BASE_URL_V2` / `XKIRO_BASE_URL_V3` | – | `XKIRO_BASE_URL` | Endpoint khusus key ke-2/ke-3 |
| `DEFAULT_PROVIDER` | – | `xkiro` → `xkirov2` → `xkirov3` → `gemini` → `groq` | Provider buat chat biasa |
| `DEEP_PROVIDER` | – | `xkiro` → `xkirov2` → `xkirov3` → `gemini` → `groq` | Provider buat `/deep` & keyword analisa |
| `GOOGLE_SHEETS_ID` | – | – | ID spreadsheet (boleh URL lengkap) |
| `GOOGLE_SA_B64` | – | – | Service account JSON, base64 |
| `DAILY_BUDGET_USD` | – | `1.00` | Patokan budget untuk laporan biaya (tidak membatasi provider) |
| `TZ` | – | `Asia/Jakarta` | Timezone untuk tanggal & reset budget |
| `LOG_LEVEL` | – | `info` | `debug` / `info` / `warn` / `error` |
| `PORT` | – | `8080` | Diisi otomatis oleh Railway |
| `HEALTH_PORT` | – | – | Opsional; menang atas `PORT`. Berguna kalau environment lokal sudah memakai `PORT` untuk hal lain (jangan diisi di Railway) |

> Minimal satu dari `XKIRO_API_KEY` (atau `_V2`/`_V3`) / `GEMINI_API_KEY` / `GROQ_API_KEY` harus diisi, kalau tidak bot menolak start dengan pesan jelas. Urutan fallback selalu xKiro → xKiro 2 → xKiro 3 → Gemini → Groq untuk provider yang aktif.

### Ganti model

Cukup ubah env `XKIRO_MODEL` (atau `XKIRO_MODEL_V2`/`XKIRO_MODEL_V3`), `GEMINI_MODEL`, / `GROQ_MODEL`, restart. Kalau nama model salah, provider akan error dan bot kasih tahu di chat/log. Cek model xKiro yang tersedia di `https://api.xkiro.com/v1/models` (tanpa key juga bisa).

Khusus Gemini, `GEMINI_THINKING_LEVEL` mengatur seberapa dalam model "berpikir" sebelum menjawab. Default `low` (paling cepat, tetap cukup detail). Naikkan ke `medium`/`high` kalau butuh jawaban lebih mendalam, atau turunkan ke `minimal` untuk model flash-lite kalau mau paling ngebut. Default `gemini-3.5-flash-lite` dipilih karena paling cepat (≈1 detik di testing); kalau butuh jawaban lebih dalam dan tidak masalah lebih lambat, pakai `GEMINI_MODEL=gemini-4-hydrogen`.

### Ubah aturan routing

Edit `src/router.ts`, bagian `DEEP_PATTERNS`. Keyword yang match akan diarahkan ke `DEEP_PROVIDER`; sisanya `DEFAULT_PROVIDER`.

Default: semua lewat xKiro. Kalau mau balik ke provider lama, set `DEFAULT_PROVIDER` / `DEEP_PROVIDER` ke `gemini` atau `groq`. Kalau cuma punya key Groq, set keduanya ke `groq` lalu ganti `GROQ_MODEL` ke model yang lebih kuat (misal `qwen/qwen3.8-27b` atau `openai/gpt-oss-120b`). Bisa juga set `DEFAULT_PROVIDER=xkirov2` kalau mau mulai dari key ke-2.

## 6. Biaya

Harga token di `src/util/cost.ts` adalah **perkiraan** (USD per 1 juta token) — sesuaikan dengan pricing terbaru provider. Budget harian dihitung dari tabel itu, jadi kalau harga berubah, update juga tabelnya.

Budget **tidak membatasi** provider apa pun — cuma dipakai buat laporan `/stats` dan `/budget`, biar kelihatan pemakaian harian. Semua provider tetap jalan walau budget sudah lewat. Model xKiro free tier harga tokennya `0` di tabel.

## 7. Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| `Missing env var` | `.env` belum lengkap / Variables Railway belum diisi |
| Bot diam saja | Chat ID belum masuk `ALLOWED_CHAT_IDS`, atau bot lain sedang polling dengan token sama |
| `409 Conflict` | Ada dua instance bot jalan dengan token sama |
| `Gemini HTTP 401` / `API key not valid` / `ACCESS_TOKEN_TYPE_UNSUPPORTED` | Key `AQ.…` belum aktif untuk Gemini API. Pastikan key dibuat di project yang sudah enable **Generative Language API** + billing, atau buat key baru di [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Kalau tetap gagal, itu masalah provisioning di sisi Google — pakai provider lain (xKiro/Groq) sementara |
| `Groq HTTP 401` | `GROQ_API_KEY` salah/revoked — cek console.groq.com |
| `Groq HTTP 404` | `GROQ_MODEL` tidak tersedia di akun lo; cek daftar model Groq |
| `xKiro HTTP 401/403` | Key xKiro salah/revoked — cek `XKIRO_API_KEY` / `_V2` / `_V3`, lalu buat key baru di xkiro.com. Provider lain tetap dipakai sebagai fallback |
| `xKiro HTTP 404` | Model harus format `vendor/model` dan tersedia; cek `XKIRO_MODEL` / `_V2` / `_V3` di `https://api.xkiro.com/v1/models` |
| `xKiro 429 / cooldown` | Free tier kena limit — bot otomatis coba key xKiro berikutnya, lalu Gemini/Groq |
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
- Jangan commit service-account JSON.
- Health endpoint hanya mengembalikan status, tanpa data sensitif.

## 9. Roadmap

- [ ] `/note`, `/cari`, `/rekap` (second brain penuh)
- [ ] Voice note → transkrip Gemini
- [ ] Foto/screenshot → Gemini vision
- [ ] SQLite + Railway Volume untuk konteks permanen
- [ ] Webhook mode (opsional, lebih hemat resource)
- [ ] OpenCode tool: `/code <task>` untuk eksekusi coding dari Telegram

## Lisensi

MIT
