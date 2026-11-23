---
name: sb-budget
description: Tampilkan sisa budget harian dari Google Sheet.
---

# sb-budget

Jangan mengarang angka. Jalankan:

```bash
python3 "$HERMES_HOME/plugins/second-brain-sheets/sheets_client.py" budget
```

Jika `$HERMES_HOME` kosong, pakai `/opt/data`.
Sampaikan output apa adanya. Jika gagal: "Gagal membaca budget dari Google Sheet."
Diperbolehkan menerima argumen tanggal `YYYY-MM-DD` setelah perintah.
