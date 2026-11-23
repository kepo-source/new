---
name: sb-model
description: Tampilkan provider/model aktif dan urutan fallback.
---

# sb-model

Laporkan konfigurasi yang sebenarnya dipakai bot (bukan tebakan):

```bash
sed -n '1,80p' "$HERMES_HOME/config.yaml"
hermes auth list custom:xkiro
```

Jika `$HERMES_HOME` kosong, pakai `/opt/data`.

Ringkas dalam Bahasa Indonesia menjadi:

```
🧠 Model aktif
• Utama: <provider>/<model>
• Fallback: <provider>/<model> → <provider>/<model>
• Key xKiro terdaftar: <jumlah> (urutan: main → v2 → v3)
• Rotasi otomatis saat limit; sesi tetap lanjut.
```

Jangan pernah menampilkan nilai API key — hanya jumlah entri.
