FROM nousresearch/hermes-agent:latest

# Seed second-brain disalin ke volume /opt/data oleh cont-init.d saat first boot.
# Image tetap stateless; semua state (config, skills, sesi, auth) ada di volume.
COPY hermes/seed/ /opt/hermes-seed/
COPY hermes/init/03-seed-second-brain.sh /etc/cont-init.d/03-seed-second-brain.sh
COPY hermes/init/apply-second-brain.sh /opt/hermes-seed/apply-second-brain.sh

RUN chmod 0755 /etc/cont-init.d/03-seed-second-brain.sh \
    && chmod 0755 /opt/hermes-seed/apply-second-brain.sh \
    && chmod -R a+rX /opt/hermes-seed

# s6 entrypoint image tetap dipakai; argumen ini diteruskan sebagai `hermes gateway run`.
CMD ["gateway", "run"]
