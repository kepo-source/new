---
name: sb-stats
description: Tampilkan statistik pemakaian dan biaya hari ini dari Google Sheet.
---

# sb-stats

Jangan mengarang angka. Jalankan perintah ini lewat tool terminal lalu sampaikan outputnya apa adanya:

```bash
python3 "$HERMES_HOME/plugins/second-brain-sheets/sheets_client.py" stats
```

Jika `$HERMES_HOME` kosong, pakai `/opt/data`.
Jika perintah gagal, laporkan: "Gagal membaca Google Sheet — cek GOOGLE_SHEETS_ID / GOOGLE_SA_B64."
Diperbolehkan menerima argumen tanggal `YYYY-MM-DD` setelah perintah.
