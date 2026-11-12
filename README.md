# 🧠 second-brain

Bot Telegram **second brain** dengan **multi-model router**: model cepat buat kerja sehari-hari, model deep buat analisa berat, dan semua pemakaian dicatat ke **Google Sheets**.

Provider yang didukung:

- **Gemini** (Google AI Studio) — default, murah, konteks panjang
- **Grok** (xAI) — deep/analisa
- **Groq** (Groq Cloud) — alternatif cepat & murah (OpenAI-compatible)

Minimal salah satu provider aktif; sisanya opsional.

```
Telegram ──▶ grammY (Node/TS)
                 │
                 ├─ AuthGuard (whitelist chat ID)
                 ├─ Router ──▶ default provider (Gemini/Groq)
                 │        └──▶ deep provider (Grok/Groq)
                 ├─ Fallback otomatis antar provider
                 └─ Logger (queue) ──▶ Google Sheets
```

## Fitur

- Chat biasa langsung dijawab, model dipilih otomatis.
- `/fast` pakai model default, `/deep` pakai model deep, `/banding` dua-duanya sekaligus.
- Fallback otomatis antar provider kalau salah satu error/rate limit.
- Provider yang kena 401/403 otomatis cooldown 15 menit (429 cooldown 60 detik), jadi chat berikutnya nggak nunggu provider rusak.
- Konteks 6 putaran terakhir per chat (in-memory).
- Log lengkap ke Sheets: model, token, latency, biaya, alasan routing.
- Budget harian menahan Grok (xAI) kalau sudah lewat batas.
- `/stats` dan `/budget` buat pantau pemakaian.
- Hanya chat ID yang di-whitelist yang bisa memakai bot.

## Command

| Command | Fungsi |
|---|---|
| _(chat biasa)_ | Auto-route |
| `/ask <teks>` | Auto-route |
| `/fast <teks>` | Paksa model default |
| `/deep <teks>` | Paksa model deep |
| `/banding <teks>` | Default + deep paralel |
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
├── providers/          # gemini.ts, grok.ts, groq.ts (+ openai-compatible base)
├── commands/           # admin, ask, banding, stats
└── util/               # logger, cost, date, text, errors
scripts/chat-id.ts      # bantu ambil chat ID
```

---

## 1. Prasyarat

- Node.js **22** (sesuai `engines` di package.json)
- Bot Telegram dari [@BotFather](https://t.me/BotFather)
- API key Gemini dari [Google AI Studio](https://aistudio.google.com/apikey) — opsional
- API key xAI (Grok) dari [console.x.ai](https://console.x.ai) — opsional
- API key Groq dari [console.groq.com](https://console.groq.com) — opsional

Minimal **satu** dari ketiga API key di atas harus ada. Kalau belum punya semuanya, Groq paling gampang buat mulai (ada free tier).
- Google Cloud project + **service account** dengan Sheets API aktif

## 2. Setup lokal

```bash
cd second-brain
npm install
cp .env.example .env
```

> ⚠️ Isi key di **`.env`**, bukan di `.env.example`. `.env` sudah di-gitignore; `.env.example` cuma template dan ikut ke-commit.

Isi `.env` minimal (pilih salah satu provider):

```env
TELEGRAM_BOT_TOKEN=...
ALLOWED_CHAT_IDS=123456789

# salah satu / lebih:
GEMINI_API_KEY=...
# XAI_API_KEY=...
# GROQ_API_KEY=...
```

> **Groq ≠ Grok.** Groq Cloud (`gsk_...`) itu provider inference untuk Llama/gpt-oss/Qwen. Grok (`xai-...`) itu model dari xAI. Kalau key `gsk_` ditaruh di `XAI_API_KEY`, bot otomatis memakainya sebagai provider Groq (dengan peringatan di log).

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

8. Isi `.env`:

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
   - `GEMINI_API_KEY`, `GEMINI_MODEL`
   - `XAI_API_KEY`, `GROK_MODEL`
   - `GROQ_API_KEY`, `GROQ_MODEL`
   - `DEFAULT_PROVIDER`, `DEEP_PROVIDER`
   - `GOOGLE_SHEETS_ID`, `GOOGLE_SA_B64`
   - `DAILY_BUDGET_USD`, `TZ`, `LOG_LEVEL`
4. Railway otomatis build pakai `railway.json` dan start `npm start`.
5. Cek **Deployments → Logs**: harus muncul `Bot jalan`.
6. Buka domain Railway + `/health` → `{"ok":true,...}`.
7. Kirim `/ping` ke bot.

> Railway tidak punya free tier permanen. Plan Hobby (±$5/bulan) sudah lebih dari cukup untuk bot ini.
>
> Kalau build OOM di mesin kecil, set variable `NODE_OPTIONS=--max-old-space-size=2048`.

## 5. Konfigurasi

| Env | Wajib | Default | Keterangan |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | – | Token dari BotFather |
| `ALLOWED_CHAT_IDS` | ✅ | – | Pisahkan dengan koma |
| `GEMINI_API_KEY` | – | – | API key Google AI Studio (`AIza...`) |
| `GEMINI_MODEL` | – | `gemini-2.5-flash` | Ganti kalau mau model lain |
| `XAI_API_KEY` | – | – | API key xAI (`xai-...`) untuk Grok |
| `GROK_MODEL` | – | `grok-4` | Sesuaikan dengan model xAI yang tersedia |
| `XAI_BASE_URL` | – | `https://api.x.ai/v1` | Biasanya tidak perlu diubah |
| `GROQ_API_KEY` | – | – | API key Groq Cloud (`gsk_...`) |
| `GROQ_MODEL` | – | `openai/gpt-oss-120b` | Model Groq yang dipakai |
| `GROQ_BASE_URL` | – | `https://api.groq.com/openai/v1` | OpenAI-compatible endpoint |
| `DEFAULT_PROVIDER` | – | `gemini` → `groq` → `grok` | Provider buat chat biasa |
| `DEEP_PROVIDER` | – | `grok` → `groq` → `gemini` | Provider buat `/deep` & keyword analisa |
| `GOOGLE_SHEETS_ID` | – | – | ID spreadsheet (boleh URL lengkap) |
| `GOOGLE_SA_B64` | – | – | Service account JSON, base64 |
| `DAILY_BUDGET_USD` | – | `1.00` | Batas biaya harian untuk Grok xAI |
| `TZ` | – | `Asia/Jakarta` | Timezone untuk tanggal & reset budget |
| `LOG_LEVEL` | – | `info` | `debug` / `info` / `warn` / `error` |
| `PORT` | – | `8080` | Diisi otomatis oleh Railway |
| `HEALTH_PORT` | – | – | Opsional; menang atas `PORT`. Berguna kalau environment lokal sudah memakai `PORT` untuk hal lain (jangan diisi di Railway) |

> Minimal satu dari `GEMINI_API_KEY` / `XAI_API_KEY` / `GROQ_API_KEY` harus diisi, kalau tidak bot menolak start dengan pesan jelas.

### Ganti model

Cukup ubah env `GEMINI_MODEL` / `GROK_MODEL` / `GROQ_MODEL`, restart. Kalau nama model salah, provider akan error dan bot kasih tahu di chat/log.

### Ubah aturan routing

Edit `src/router.ts`, bagian `DEEP_PATTERNS`. Keyword yang match akan diarahkan ke `DEEP_PROVIDER`; sisanya `DEFAULT_PROVIDER`.

Contoh: kalau cuma punya key Groq, set `DEFAULT_PROVIDER=groq` dan `DEEP_PROVIDER=groq`, lalu ganti `GROQ_MODEL` ke model yang lebih kuat (misal `qwen/qwen3.8-27b` atau `openai/gpt-oss-120b`).

## 6. Biaya

Harga token di `src/util/cost.ts` adalah **perkiraan** (USD per 1 juta token) — sesuaikan dengan pricing terbaru provider. Budget harian dihitung dari tabel itu, jadi kalau harga berubah, update juga tabelnya.

Budget hanya menahan **Grok xAI** (provider termahal). Gemini dan Groq tetap jalan walau budget habis, supaya bot nggak mati total. Kalau Grok satu-satunya provider aktif, Grok tetap dipakai dengan peringatan.

## 7. Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| `Missing env var` | `.env` belum lengkap / Variables Railway belum diisi |
| Bot diam saja | Chat ID belum masuk `ALLOWED_CHAT_IDS`, atau bot lain sedang polling dengan token sama |
| `409 Conflict` | Ada dua instance bot jalan dengan token sama |
| `Gemini HTTP 401` / `API key not valid` | Key dari AI Studio yang berawalan `AQ.` sedang bermasalah di sisi Google. Regenerate key sampai dapat format `AIza...`, lalu hapus spasi/kutip di `.env` |
| `Grok HTTP 400` / `Incorrect API key` | Pastikan itu key **xAI** (`xai-...`) dari console.x.ai, bukan key **Groq Cloud** (`gsk_...`) dari console.groq.com |
| `Grok HTTP 404 model not found` | Ganti `GROK_MODEL` sesuai model yang tersedia di akun xAI lo |
| `Grok HTTP 401` | `XAI_API_KEY` salah atau bukan key xAI |
| `Groq HTTP 401` | `GROQ_API_KEY` salah/revoked — cek console.groq.com |
| `Groq HTTP 404` | `GROQ_MODEL` tidak tersedia di akun lo; cek daftar model Groq |
| Key `gsk_...` bikin error Grok | Itu key Groq. Pindahkan ke `GROQ_API_KEY` (bot juga auto-detect kalau ditaruh di `XAI_API_KEY`) |
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
