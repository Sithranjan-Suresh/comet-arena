import { APP_TZ } from "./tz";

const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

export type FormatStyle = "datetime" | "date" | "time" | "weekday";

const formatters: Record<FormatStyle, Intl.DateTimeFormatOptions> = {
  datetime: { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" },
  date: { month: "short", day: "numeric", year: "numeric" },
  time: { hour: "numeric", minute: "2-digit" },
  weekday: { weekday: "short", month: "short", day: "numeric" },
};

/**
 * Format an instant in America/Chicago, always labelled "CT" (product_spec §4: deadlines are
 * displayed in Central Time with "CT"). Includes dates and times only as requested.
 */
export function formatCT(input: Date | string, style: FormatStyle = "datetime"): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  const text = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, ...formatters[style] }).format(
    d,
  );
  // "Nov 20, 2026, 11:59 PM" -> "Nov 20, 2026, 11:59 PM CT"; date-only styles carry no time zone.
  return style === "date" || style === "weekday" ? text : `${text} CT`;
}

/** Whole days from `now` until `target` (floor). Negative when the target has passed. */
export function daysUntil(target: Date | string, now: Date = new Date()): number {
  const t = typeof target === "string" ? new Date(target) : target;
  return Math.floor((t.getTime() - now.getTime()) / MS_DAY);
}

/** "updated today" / "updated 3 days ago" / "updated 2 weeks ago" / "updated 4 months ago". */
export function relativeUpdated(updated: Date | string, now: Date = new Date()): string {
  const d = typeof updated === "string" ? new Date(updated) : updated;
  const diff = Math.max(0, now.getTime() - d.getTime());
  const days = Math.floor(diff / MS_DAY);
  if (days < 1) return "updated today";
  if (days === 1) return "updated 1 day ago";
  if (days < 14) return `updated ${days} days ago`;
  if (days < 60) return `updated ${Math.floor(days / 7)} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "updated 1 month ago" : `updated ${months} months ago`;
}

export const TIME_UNITS = { MS_MIN, MS_HOUR, MS_DAY } as const;
