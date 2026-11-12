import type { Bot } from "grammy";
import { formatUsd } from "../util/cost.js";
import { seedUsage, snapshot } from "../usage.js";

function number(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function registerStats(bot: Bot): void {
  bot.command("stats", async (ctx) => {
    await seedUsage();
    const stats = snapshot();

    const lines = [
      `📊 Stats ${stats.day} (${stats.totals.calls} request)`,
      `Token: ${number(stats.totals.tokensIn)} in / ${number(stats.totals.tokensOut)} out`,
      `Biaya: ${formatUsd(stats.totals.cost)} dari ${formatUsd(stats.budget)}`,
      `Sisa: ${formatUsd(stats.remaining)}`,
    ];

    if (stats.byModel.size > 0) {
      lines.push("", "Per model:");
      for (const [model, usage] of stats.byModel) {
        lines.push(
          `• ${model}: ${usage.calls}x · ${formatUsd(usage.cost)}`,
        );
      }
    }

    await ctx.reply(lines.join("\n"));
  });

  bot.command("budget", async (ctx) => {
    await seedUsage();
    const stats = snapshot();

    const usedRatio =
      stats.budget > 0 ? Math.min(1, stats.totals.cost / stats.budget) : 0;
    const barLength = 12;
    const filled = Math.round(usedRatio * barLength);
    const bar = `${"█".repeat(filled)}${"░".repeat(barLength - filled)}`;

    await ctx.reply(
      [
        `💸 Budget harian: ${formatUsd(stats.budget)}`,
        `${bar} ${(usedRatio * 100).toFixed(0)}%`,
        `Terpakai: ${formatUsd(stats.totals.cost)}`,
        `Sisa: ${formatUsd(stats.remaining)}`,
      ].join("\n"),
    );
  });
}
