---
name: sb-banding
description: Bandingkan dua pendekatan/model dan beri rekomendasi.
---

# sb-banding

Buat perbandingan dua sudut pandang untuk pertanyaan yang diberikan.

Format wajib:

```
🆚 BANDING

🅰️ Opsi A — <nama>
<penjelasan singkat>
+ kelebihan
− kekurangan

🅱️ Opsi B — <nama>
<penjelasan singkat>
+ kelebihan
− kekurangan

🏆 Rekomendasi: <pilihan + alasan 1–2 kalimat>
```

Kalau pengguna menyebut model/provider tertentu, gunakan itu sebagai label A/B.
Kalau tidak, pakai dua pendekatan yang paling relevan (misalnya "cepat/murah" vs "akurat/mendalam").
Kalau teks kosong: "Contoh: `/banding mana yang lebih cocok buat project kecil, SQLite atau Postgres?`".
