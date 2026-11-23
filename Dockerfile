FROM nousresearch/hermes-agent:latest

# Seed second-brain disalin ke volume /opt/data oleh cont-init.d saat first boot.
# Image tetap stateless; semua state (config, skills, sesi, auth) ada di volume.
COPY hermes/seed/ /opt/hermes-seed/
COPY hermes/init/03-seed-second-brain.sh /etc/cont-init.d/03-seed-second-brain.sh
COPY hermes/init/apply-second-brain.sh /opt/hermes-seed/apply-second-brain.sh
COPY hermes/init/stage2-hook.sh /opt/hermes-seed/stage2-hook.sh

# Railway menjalankan entrypoint image bukan sebagai PID 1. Image lalu memakai
# jalur fallback yang memanggil stage2-hook.sh langsung dan MELEWATI
# /etc/cont-init.d/*. Wrap stage2 supaya config second-brain tetap dipakai.
RUN mv /opt/hermes/docker/stage2-hook.sh /opt/hermes/docker/stage2-hook.sh.orig \
    && cp /opt/hermes-seed/stage2-hook.sh /opt/hermes/docker/stage2-hook.sh \
    && chmod 0755 /opt/hermes/docker/stage2-hook.sh \
    && chmod 0755 /etc/cont-init.d/03-seed-second-brain.sh \
    && chmod 0755 /opt/hermes-seed/apply-second-brain.sh \
    && chmod -R a+rX /opt/hermes-seed

# s6 entrypoint image tetap dipakai; argumen ini diteruskan sebagai `hermes gateway run`.
CMD ["gateway", "run"]
