#!/bin/sh
# Jalankan stage2 image dulu (chown volume, seed config default, sync skills),
# lalu timpa dengan konfigurasi second-brain. Railway menjalankan image dengan
# entrypoint bukan PID 1 → s6/cont-init.d dilewati, jadi hook ini satu-satunya
# tempat yang dipanggil baik di jalur s6 maupun di jalur fallback.
set -eu

/opt/hermes/docker/stage2-hook.sh.orig "$@"
sh /opt/hermes-seed/apply-second-brain.sh
