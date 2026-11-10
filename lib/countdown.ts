import { TIME_UNITS } from "./time";

export interface CountdownParts {
  state: "open" | "closed";
  days: number;
  hours: number;
  minutes: number;
  /** LED text, e.g. "03d 04h 12m", "04h 12m", "12m", "<1m". */
  digits: string;
  /** Screen-reader text, e.g. "3 days 4 hours until deadline". */
  spoken: string;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
const pad = (n: number) => String(n).padStart(2, "0");

/** Break the time remaining until `deadline` into LED digits and a spoken equivalent. */
export function countdownParts(deadline: Date | string, now: Date = new Date()): CountdownParts {
  const target = typeof deadline === "string" ? new Date(deadline) : deadline;
  const remaining = target.getTime() - now.getTime();
  if (Number.isNaN(remaining) || remaining <= 0) {
    return {
      state: "closed",
      days: 0,
      hours: 0,
      minutes: 0,
      digits: "CLOSED",
      spoken: "Deadline has passed",
    };
  }
  const days = Math.floor(remaining / TIME_UNITS.MS_DAY);
  const hours = Math.floor((remaining % TIME_UNITS.MS_DAY) / TIME_UNITS.MS_HOUR);
  const minutes = Math.floor((remaining % TIME_UNITS.MS_HOUR) / TIME_UNITS.MS_MIN);

  if (days >= 1) {
    return {
      state: "open",
      days,
      hours,
      minutes,
      digits: `${pad(days)}d ${pad(hours)}h ${pad(minutes)}m`,
      spoken: `${plural(days, "day")} ${plural(hours, "hour")} until deadline`,
    };
  }
  if (hours >= 1) {
    return {
      state: "open",
      days,
      hours,
      minutes,
      digits: `${pad(hours)}h ${pad(minutes)}m`,
      spoken: `${plural(hours, "hour")} ${plural(minutes, "minute")} until deadline`,
    };
  }
  if (minutes >= 1) {
    return {
      state: "open",
      days,
      hours,
      minutes,
      digits: `${pad(minutes)}m`,
      spoken: `${plural(minutes, "minute")} until deadline`,
    };
  }
  return {
    state: "open",
    days,
    hours,
    minutes,
    digits: "<1m",
    spoken: "Less than a minute until deadline",
  };
}
