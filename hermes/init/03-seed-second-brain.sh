#!/bin/sh
# Seed awal s6-overlay. Logika ada di apply-second-brain.sh supaya
# identik dengan yang dijalankan startCommand Railway.
set -eu
exec sh /opt/hermes-seed/apply-second-brain.sh
