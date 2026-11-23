#!/bin/sh
# Terapkan konfigurasi second-brain SEBELUM gateway start.
# Dipakai dua kali:
#   1. cont-init.d (first boot) — seed tanpa argumen
#   2. Railway startCommand   — argumen --gateway, lalu exec gateway
# Semua operasi idempotent, aman diulang setiap deploy/restart.
set -eu

export HERMES_HOME=/opt/data
# Paksa config.yaml /opt/data dipakai. Variable lama di Railway bisa
# membuat Hermes mengabaikan config.yaml dan memakai default bawaan.
unset HERMES_IGNORE_USER_CONFIG HERMES_PROFILE HERMES_ENV HERMES_CONFIG || true

SEED=/opt/hermes-seed
HOME_DIR=/opt/data

mkdir -p "$HOME_DIR/skills/second-brain" \
         "$HOME_DIR/plugins/second-brain-sheets" \
         "$HOME_DIR/skill-bundles" \
         "$HOME_DIR/workspace"

# Config + skill + plugin selalu ditimpa supaya perubahan repo ikut deploy.
cp -f "$SEED/config.yaml" "$HOME_DIR/config.yaml"
cp -R "$SEED/skills/second-brain/." "$HOME_DIR/skills/second-brain/"
cp -R "$SEED/plugins/second-brain-sheets/." "$HOME_DIR/plugins/second-brain-sheets/"
cp -f "$SEED/skill-bundles/second-brain.yaml" "$HOME_DIR/skill-bundles/second-brain.yaml"

# Kalau image membuat profile, config root juga disalin ke tiap profile.
for profile_cfg in "$HOME_DIR"/profiles/*/config.yaml; do
    [ -f "$profile_cfg" ] || continue
    cp -f "$SEED/config.yaml" "$profile_cfg"
done

# Daftarkan 3 key xKiro sebagai credential pool custom:xkiro.
# remove + add membuat priority tetap 0/1/2 walau script diulang.
for VAR in XKIRO_API_KEY XKIRO_API_KEY_2 XKIRO_API_KEY_3; do
    eval "VAL=\${$VAR:-}"
    hermes auth remove custom:xkiro "$VAR" >/dev/null 2>&1 || true
    if [ -n "$VAL" ]; then
        hermes auth add custom:xkiro --type api-key --api-key "$VAL" --label "$VAR" >/dev/null 2>&1 \
            || echo "second-brain: gagal mendaftarkan $VAR" >&2
    fi
done

if id hermes >/dev/null 2>&1; then
    chown -R hermes:hermes \
        "$HOME_DIR/config.yaml" \
        "$HOME_DIR/auth.json" \
        "$HOME_DIR/skills/second-brain" \
        "$HOME_DIR/plugins/second-brain-sheets" \
        "$HOME_DIR/skill-bundles" \
        "$HOME_DIR/workspace" 2>/dev/null || true
fi

echo "second-brain: config diterapkan (HERMES_HOME=$HERMES_HOME)"

if [ "${1:-}" = "--gateway" ]; then
    exec hermes gateway run
fi
