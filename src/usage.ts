import { config } from "./config.js";
import { getTodayUsage, type UsageTotals } from "./sheets.js";
import { dateKey } from "./util/date.js";
import { logger } from "./util/logger.js";

let day = dateKey();
let totals: UsageTotals = { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
let byModel = new Map<string, UsageTotals>();
let seeded = false;

function blank(): UsageTotals {
  return { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
}

function rollover(): void {
  const today = dateKey();
  if (today === day) return;
  day = today;
  totals = blank();
  byModel = new Map();
  logger.info({ day }, "Budget harian direset");
}

/**
 * Ambil pemakaian hari ini dari Sheets sekali di awal, supaya budget cap
 * tidak ke-reset tiap bot restart.
 */
export async function seedUsage(): Promise<void> {
  if (seeded) return;
  seeded = true;

  const usage = await getTodayUsage(day);
  if (!usage) return;

  totals = usage.totals;

  for (const [model, value] of Object.entries(usage.byModel)) {
    byModel.set(model, value);
  }

  logger.info(
    { cost: Number(totals.cost.toFixed(6)), calls: totals.calls, day },
    "Usage hari ini dimuat dari Sheets",
  );
}

export function record(
  model: string,
  tokensIn: number,
  tokensOut: number,
  cost: number,
): void {
  rollover();

  totals.calls += 1;
  totals.tokensIn += tokensIn;
  totals.tokensOut += tokensOut;
  totals.cost += cost;

  const current = byModel.get(model) ?? blank();
  current.calls += 1;
  current.tokensIn += tokensIn;
  current.tokensOut += tokensOut;
  current.cost += cost;
  byModel.set(model, current);
}

export function hasBudget(): boolean {
  rollover();
  return totals.cost < config.budgetUsd;
}

export function budgetRemaining(): number {
  rollover();
  return Math.max(0, config.budgetUsd - totals.cost);
}

export function snapshot(): {
  day: string;
  totals: UsageTotals;
  byModel: Map<string, UsageTotals>;
  remaining: number;
  budget: number;
} {
  rollover();
  return {
    day,
    totals: { ...totals },
    byModel: new Map(
      [...byModel.entries()].map(([model, value]) => [model, { ...value }]),
    ),
    remaining: budgetRemaining(),
    budget: config.budgetUsd,
  };
}
