/** Low-level America/Chicago helpers. Higher-level formatting lives in lib/time.ts. */
export const APP_TZ = "America/Chicago";

/** Offset (ms) of `tz` from UTC at the given instant: local = utc + offset. */
export function tzOffsetMs(instant: Date, tz: string = APP_TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Convert a wall-clock time in America/Chicago to the corresponding UTC instant (DST-safe). */
export function chicagoToUtc(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let guess = naive - tzOffsetMs(new Date(naive));
  // Re-check once: near DST transitions the first offset can be off by an hour.
  guess = naive - tzOffsetMs(new Date(guess));
  return new Date(guess);
}

/** Calendar parts (y, m, d) of an instant as seen in America/Chicago. */
export function chicagoDateParts(instant: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Wall-clock parts of an instant as seen in America/Chicago. */
export function chicagoWallClock(instant: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}
