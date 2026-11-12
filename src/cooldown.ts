import type { ProviderName } from "./providers/types.js";
import { logger } from "./util/logger.js";

const AUTH_COOLDOWN_MS = 15 * 60_000;
const RATE_COOLDOWN_MS = 60_000;

const until = new Map<ProviderName, number>();

export function markProviderFailure(
  name: ProviderName,
  status?: number,
): void {
  let cooldownMs = 0;

  if (status === 401 || status === 403) {
    cooldownMs = AUTH_COOLDOWN_MS;
  } else if (status === 429) {
    cooldownMs = RATE_COOLDOWN_MS;
  }

  if (cooldownMs === 0) return;

  until.set(name, Date.now() + cooldownMs);
  logger.warn(
    { provider: name, status, cooldownSec: Math.round(cooldownMs / 1000) },
    "Provider masuk cooldown",
  );
}

export function isCoolingDown(name: ProviderName): boolean {
  const expiresAt = until.get(name);
  if (!expiresAt) return false;

  if (Date.now() >= expiresAt) {
    until.delete(name);
    return false;
  }

  return true;
}
