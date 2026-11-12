import { config } from "../config.js";

/** YYYY-MM-DD sesuai timezone yang dikonfigurasi. */
export function dateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function timeLabel(date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
