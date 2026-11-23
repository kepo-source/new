# 🧠 second-brain — Hermes Agent Edition

Bot Telegram **@badasht_bot** dijalankan sebagai **Hermes Agent** (Nous Research) di Railway. Implementasi TypeScript lama sudah diganti penuh; file `src/` dan `package.json` hanya disimpan sebagai rollback (tag `pre-hermes` di `bc0467c`).

```
Telegram ──▶ Hermes gateway
                 ├─ whitelist: TELEGRAM_ALLOWED_USERS
                 ├─ model utama: xKiro (mistralai/mistral-medium-3.5)
                 │     └─ credential pool: key #1 → #2 → #3 (fill_first)
                 ├─ fallback: Gemini 3.5 Flash Lite → Groq gpt-oss-120b
                 ├─ skills: /sb-* + bundle /second-brain
                 └─ plugin: batch log ke tab `messages` Google Sheet yang ada
```

Semua state (config, `auth.json`, skills, plugin, sesi chat) ada di **Railway volume `/opt/data`**. Image tetap turunan `nousresearch/hermes-agent:latest` dengan entrypoint s6, `CMD ["gateway", "run"]`.

## Perintah

| Perintah | Fungsi |
|---|---|
| _(pesan teks biasa)_ | Sama seperti `/sb-ask` |
| `/second-brain` | Bundel semua skill di bawah |
| `/sb-ask <teks>` | Tanya dengan model utama + rotasi/fallback otomatis |
| `/sb-fast <teks>` | Jawab cepat, ringkas (model medium) |
| `/sb-deep <teks>` | Analisis terstruktur + trade-off + rekomendasi |
| `/sb-banding <teks>` | Bandingkan dua opsi, lalu rekomendasi |
| `/sb-stats` | Pemakaian & biaya hari ini dari Google Sheet |
| `/sb-budget` | Sisa budget harian dari Google Sheet |
| `/sb-model` | Model aktif, urutan fallback, jumlah key xKiro (tanpa menampilkan key) |
| `/sb-reset` | Sesi baru (konteks dihapus) |
| `/sb-help` | Daftar perintah |

## Susunan file Hermes

```
Dockerfile                         # FROM hermes-agent + seed + CMD gateway run
railway.json                       # builder DOCKERFILE, tanpa healthcheck
hermes/init/03-seed-second-brain.sh# cont-init: seed /opt/data sekali saja
hermes/seed/config.yaml            # model, providers, pool, fallback, Telegram
hermes/seed/plugins/
  second-brain-sheets/             # hook pre_llm_call + post_api_request
hermes/seed/skills/second-brain/   # 9 skill /sb-*
hermes/seed/skill-bundles/         # /second-brain
```

Seed hanya jalan kalau `/opt/data/.second-brain-seeded` belum ada — jadi **config hasil edit di volume tidak akan ditimpa saat restart/redeploy**.

## Variabel Railway

| Variable | Wajib | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Token `@badasht_bot` |
| `TELEGRAM_ALLOWED_USERS` | ✅ | `1721126502` (whitelist user) |
| `XKIRO_API_KEY` | ✅ | Key xKiro utama (priority 0) |
| `XKIRO_API_KEY_2` | ✅ | Key xKiro kedua (priority 1) |
| `XKIRO_API_KEY_3` | ✅ | Key xKiro ketiga (priority 2) |
| `GEMINI_API_KEY` | ✅ | Fallback pertama |
| `GROQ_API_KEY` | ✅ | Fallback kedua |
| `GOOGLE_SHEETS_ID` | ✅ | ID spreadsheet yang sudah ada |
| `GOOGLE_SA_B64` | ✅ | Service account JSON, base64 satu baris |
| `DAILY_BUDGET_USD` | – | Default `1.00`, hanya untuk laporan |
| `TZ` | – | Default `Asia/Jakarta` |

Variabel lama yang **tidak dipakai lagi**: `ALLOWED_CHAT_IDS`, `TELEGRAM_MODE`, `PUBLIC_DOMAIN`, `TELEGRAM_WEBHOOK_*`, `XKIRO_API_KEY_V2`, `XKIRO_API_KEY_V3`, `XKIRO_MODEL`, `DEFAULT_PROVIDER`, `DEEP_PROVIDER`, `HERMES_*`, `PORT`, `HEALTH_PORT`. Hapus dari Railway supaya tidak membingungkan.

## Deploy / cutover

1. Repo: `https://github.com/kepo-source/new.git`, branch `main`.
2. Pastikan **volume** ter-mount di `/opt/data` pada service yang sama.
3. **Matikan service bot TypeScript lama lebih dulu.** Token Telegram hanya boleh dipegang satu consumer; kalau dua proses jalan bersamaan, `getUpdates` akan kena `409 Conflict`.
4. Deploy revision ini (`railway up --ci` atau trigger GitHub sesuai konfigurasi service).
5. Cek log container: harus ada `second-brain: seed selesai (3 key xKiro terdaftar)`.
6. Uji dari Telegram: `/sb-help`, lalu `/sb-ask coba`, lalu `/sb-stats`.
7. Verifikasi di container:
   ```sh
   hermes auth list custom:xkiro
   python3 "$HERMES_HOME/plugins/second-brain-sheets/sheets_client.py" ping
   ```

Rollback ke bot lama: deploy tag `pre-hermes` (commit `bc0467c`) ke service lama, dan matikan service Hermes terlebih dahulu.

## Google Sheets

Tab yang dipakai: **`messages`** (jangan diganti). Header `A1:J1`:

```
ts | chat_id | role | model | prompt_chars | tokens_in | tokens_out | latency_ms | cost_usd | routed_by
```

Plugin menulis baris `assistant` per API call dengan batch **10 baris / 30 detik**. `/sb-stats` dan `/sb-budget` membaca tab yang sama, jadi baris yang masih di queue mungkin belum masuk hitungan beberapa detik.

Perkiraan harga token ada di `hermes/seed/plugins/second-brain-sheets/sheets_client.py` (`PRICES`).

## Rotasi & fallback

- `credential_pool_strategies: custom:xkiro: fill_first` → key #1 dipakai sampai gagal/quota, lalu #2, lalu #3.
- Gagal dengan 402/quota memicu rotasi **di request yang sama**; sesi Telegram tetap lanjut (tersimpan di `/opt/data/sessions/`).
- Setelah masa cooldown habis, pool bisa kembali ke key #1.
- Kalau ketiga key tidak bisa dipakai, Hermes mencoba `gemini-3.5-flash-lite`, lalu `openai/gpt-oss-120b` via `custom:groq`.

## Keamanan

- API key **tidak** ditulis di `config.yaml`. Seed memanggil `hermes auth add custom:xkiro` menyimpan key ke `/opt/data/auth.json`.
- Hanya `TELEGRAM_ALLOWED_USERS` yang balasan botnya diproses (`gateway.unauthorized_dm_behavior: ignore`).
- Log Sheets hanya menyimpan `prompt_chars`, bukan isi prompt.
- Semua secret yang pernah ditempel di chat/terminal sebaiknya di-rotate setelah deploy stabil.

## Troubleshooting

| Gejala | Solusi |
|---|---|
| `409 Conflict` | Masih ada bot lama/proses lain yang memakai token yang sama. Matikan dulu. |
| Bot diam | `TELEGRAM_ALLOWED_USERS` belum sesuai, atau gateway belum connect. |
| `second-brain: WARNING tidak ada XKIRO_API_KEY*` | Variable belum masuk ke service. Isi lalu **hapus** `/opt/data/.second-brain-seeded` dan restart. |
| `hermes auth list custom:xkiro` kosong | Skrip seed gagal; cek log cont-init dan `auth.json` di volume. |
| `/sb-stats` gagal baca Sheet | Cek `GOOGLE_SHEETS_ID`, `GOOGLE_SA_B64`, dan spreadsheet sudah di-share ke `client_email` service account. |
| Skill tidak muncul | `hermes reload-skills`, lalu cek `hermes skills list`. |
| Key berubah tapi bot masih pakai yang lama | Seed hanya sekali. Hapus entri lama via `hermes auth remove custom:xkiro <index>` atau rebuild volume. |
