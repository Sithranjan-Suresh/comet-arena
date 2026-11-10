import { chicagoWallClock } from "@/lib/tz";
import { formatCT } from "@/lib/time";

/** One stage of a saved competition, flattened for the Schedule. */
export interface ScheduleStage {
  stage_id: string;
  stage_name: string;
  starts_at: string | null;
  deadline_at: string;
  competition_id: string;
  slug: string;
  title: string;
  register_url: string | null;
}

export interface ScheduleWeek {
  /** Monday of the week as YYYY-MM-DD (Chicago). */
  key: string;
  label: string;
  stages: ScheduleStage[];
}

export interface Schedule {
  weeks: ScheduleWeek[];
  /** Stages whose deadline has passed, most recent first (shown collapsed). */
  past: ScheduleStage[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Monday (Chicago calendar) of the week containing `instant`, as a UTC-midnight Date for arithmetic. */
function mondayOf(instant: Date): Date {
  const { year, month, day } = chicagoWallClock(instant);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

const keyOf = (monday: Date) =>
  `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;

export function weekLabel(monday: Date, thisMonday: Date): string {
  const diffWeeks = Math.round((monday.getTime() - thisMonday.getTime()) / (7 * 86_400_000));
  if (diffWeeks === 0) return "This week";
  if (diffWeeks === 1) return "Next week";
  // Format the Monday itself ("Nov 23") without a time zone shift.
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(monday);
  return `Week of ${label}`;
}

/**
 * Group saved stages into weeks (Monday start, Chicago time), soonest first. Stages already past go to
 * `past`. Stable and deterministic for a given `now`.
 */
export function buildSchedule(stages: ScheduleStage[], now: Date = new Date()): Schedule {
  const thisMonday = mondayOf(now);
  const upcoming: ScheduleStage[] = [];
  const past: ScheduleStage[] = [];
  for (const s of stages) {
    if (Number.isNaN(Date.parse(s.deadline_at))) continue;
    (new Date(s.deadline_at).getTime() >= now.getTime() ? upcoming : past).push(s);
  }
  const byDeadline = (a: ScheduleStage, b: ScheduleStage) =>
    a.deadline_at.localeCompare(b.deadline_at) ||
    a.title.localeCompare(b.title) ||
    a.stage_name.localeCompare(b.stage_name);
  upcoming.sort(byDeadline);
  past.sort((a, b) => byDeadline(b, a));

  const weeks = new Map<string, ScheduleWeek>();
  for (const s of upcoming) {
    const monday = mondayOf(new Date(s.deadline_at));
    const key = keyOf(monday);
    if (!weeks.has(key)) weeks.set(key, { key, label: weekLabel(monday, thisMonday), stages: [] });
    weeks.get(key)!.stages.push(s);
  }
  return { weeks: [...weeks.values()], past };
}

/** "Fri, Nov 20, 11:59 PM CT" style line for a stage row. */
export function stageWhenLine(s: Pick<ScheduleStage, "deadline_at">): string {
  return `${formatCT(s.deadline_at, "weekday")}, ${formatCT(s.deadline_at, "time")}`;
}
