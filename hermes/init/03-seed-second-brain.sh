#!/bin/sh
# Seed konfigurasi second-brain ke volume /opt/data sekali saja.
# Dijalankan s6-overlay setelah 01-hermes-setup (yang menyiapkan home + config default).
set -eu

HOME_DIR="${HERMES_HOME:-/opt/data}"
MARKER="$HOME_DIR/.second-brain-seeded"

if [ -f "$MARKER" ]; then
    exit 0
fi

mkdir -p "$HOME_DIR/skills/second-brain" \
         "$HOME_DIR/plugins/second-brain-sheets" \
         "$HOME_DIR/skill-bundles" \
         "$HOME_DIR/workspace"

# Config kita yang menang (deploy ini memang khusus second-brain).
cp -f /opt/hermes-seed/config.yaml "$HOME_DIR/config.yaml"

# Skills + plugin logging Sheets.
cp -R /opt/hermes-seed/skills/second-brain/. "$HOME_DIR/skills/second-brain/"
cp -R /opt/hermes-seed/plugins/second-brain-sheets/. "$HOME_DIR/plugins/second-brain-sheets/"
cp -f /opt/hermes-seed/skill-bundles/second-brain.yaml "$HOME_DIR/skill-bundles/second-brain.yaml"

# Daftarkan 3 key xKiro sebagai credential pool custom:xkiro.
# `hermes auth add` mengisi priority 0,1,2 sesuai urutan pemanggilan →
# main → v2 → v3 dengan strategi fill_first.
# Seed bisa diulang (misal habis rotate key): entri lama dengan label yang sama
# dibuang dulu supaya prioritas tetap 0/1/2 dan tidak ada duplikat.
added=0
for VAR in XKIRO_API_KEY XKIRO_API_KEY_2 XKIRO_API_KEY_3; do
    eval "VAL=\${$VAR:-}"
    hermes auth remove custom:xkiro "$VAR" >/dev/null 2>&1 || true
    if [ -n "$VAL" ]; then
        if hermes auth add custom:xkiro --type api-key --api-key "$VAL" --label "$VAR" >/dev/null 2>&1; then
            added=$((added + 1))
        else
            echo "second-brain: gagal mendaftarkan $VAR ke credential pool" >&2
        fi
    fi
done

if [ "$added" -eq 0 ]; then
    echo "second-brain: WARNING tidak ada XKIRO_API_KEY* di environment" >&2
fi

# File hasil seed dibuat root; pastikan user hermes bisa baca/tulis.
if id hermes >/dev/null 2>&1; then
    chown -R hermes:hermes \
        "$HOME_DIR/config.yaml" \
        "$HOME_DIR/auth.json" \
        "$HOME_DIR/skills/second-brain" \
        "$HOME_DIR/plugins/second-brain-sheets" \
        "$HOME_DIR/workspace" 2>/dev/null || true
fi

printf 'xkiro_keys=%s\n' "$added" > "$MARKER"
echo "second-brain: seed selesai ($added key xKiro terdaftar)"
