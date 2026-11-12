# 🧠 second-brain

Bot Telegram **second brain** dengan **multi-model router**: Gemini buat kerja cepat sehari-hari, Grok buat analisa berat, dan semua pemakaian dicatat ke **Google Sheets**.

```
Telegram ──▶ grammY (Node/TS)
                 │
                 ├─ AuthGuard (whitelist chat ID)
                 ├─ Router ──▶ Gemini (default)
                 │        └──▶ Grok (analisa/strategi/prediksi)
                 ├─ Fallback otomatis Gemini ⇄ Grok
                 └─ Logger (queue) ──▶ Google Sheets
```

## Fitur

- Chat biasa langsung dijawab, model dipilih otomatis.
- `/fast` paksa Gemini, `/deep` paksa Grok, `/banding` dua-duanya sekaligus.
- Fallback otomatis kalau salah satu provider error/rate limit.
- Konteks 6 putaran terakhir per chat (in-memory).
- Log lengkap ke Sheets: model, token, latency, biaya, alasan routing.
- Budget harian hard-cap: Grok otomatis dilewati kalau budget habis.
- `/stats` dan `/budget` buat pantau pemakaian.
- Hanya chat ID yang di-whitelist yang bisa memakai bot.

## Command

| Command | Fungsi |
|---|---|
| _(chat biasa)_ | Auto-route |
| `/ask <teks>` | Auto-route |
| `/fast <teks>` | Paksa Gemini |
| `/deep <teks>` | Paksa Grok |
| `/banding <teks>` | Gemini + Grok paralel |
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
├── providers/          # gemini.ts, grok.ts
├── commands/           # admin, ask, banding, stats
└── util/               # logger, cost, date, text, errors
scripts/chat-id.ts      # bantu ambil chat ID
```

---

## 1. Prasyarat

- Node.js **20+** (disarankan 22)
- Bot Telegram dari [@BotFather](https://t.me/BotFather)
- API key Gemini dari [Google AI Studio](https://aistudio.google.com/apikey)
- API key xAI (Grok) dari [console.x.ai](https://console.x.ai)
- Google Cloud project + **service account** dengan Sheets API aktif

## 2. Setup lokal

```bash
cd second-brain
npm install
cp .env.example .env
```

Isi `.env` minimal:

```env
TELEGRAM_BOT_TOKEN=...
ALLOWED_CHAT_IDS=123456789
GEMINI_API_KEY=...
XAI_API_KEY=...
```

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
| `GEMINI_API_KEY` | ✅ | – | API key Google AI Studio |
| `GEMINI_MODEL` | – | `gemini-2.5-flash` | Ganti kalau mau model lain |
| `XAI_API_KEY` | ✅ | – | API key xAI |
| `GROK_MODEL` | – | `grok-4` | Sesuaikan dengan model yang tersedia di akun lo |
| `XAI_BASE_URL` | – | `https://api.x.ai/v1` | Biasanya tidak perlu diubah |
| `GOOGLE_SHEETS_ID` | – | – | ID spreadsheet |
| `GOOGLE_SA_B64` | – | – | Service account JSON, base64 |
| `DAILY_BUDGET_USD` | – | `1.00` | Hard cap biaya harian |
| `TZ` | – | `Asia/Jakarta` | Timezone untuk tanggal & reset budget |
| `LOG_LEVEL` | – | `info` | `debug` / `info` / `warn` / `error` |
| `PORT` | – | `8080` | Diisi otomatis oleh Railway |

### Ganti model

Cukup ubah env `GEMINI_MODEL` / `GROK_MODEL`, restart. Kalau nama model salah, provider akan error dan bot kasih tahu di chat/log.

### Ubah aturan routing

Edit `src/router.ts`, bagian `DEEP_PATTERNS`. Keyword yang match akan diarahkan ke Grok; sisanya Gemini.

## 6. Biaya

Harga token di `src/util/cost.ts` adalah **perkiraan** (USD per 1 juta token) — sesuaikan dengan pricing terbaru provider. Budget cap dihitung dari tabel itu, jadi kalau harga berubah, update juga tabelnya.

Default routing sengaja "Gemini dulu" karena jauh lebih murah. Grok hanya kepakai untuk pertanyaan berat atau kalau diminta eksplisit.

## 7. Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| `Missing env var` | `.env` belum lengkap / Variables Railway belum diisi |
| Bot diam saja | Chat ID belum masuk `ALLOWED_CHAT_IDS`, atau bot lain sedang polling dengan token sama |
| `409 Conflict` | Ada dua instance bot jalan dengan token sama |
| `Gemini HTTP 404` | Nama model salah / tidak tersedia untuk key lo |
| `Grok HTTP 401` | `XAI_API_KEY` salah atau bukan key xAI |
| `Sheets ... permission` | Spreadsheet belum di-share ke email service account (role Editor) |
| `Sheets ... parse range` | Tab `messages` belum ada — bot harus jalan sekali dengan akses Sheets yang benar |
| Log Sheets telat | Normal: ditulis per batch (10 baris / 30 detik) supaya hemat quota |
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
