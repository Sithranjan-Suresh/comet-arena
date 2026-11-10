import type { Extraction } from "@/lib/schemas";
import { chicagoToUtc, chicagoWallClock } from "@/lib/tz";

export interface PostProcessResult {
  extraction: Extraction;
  /** True when we had to choose the year (the flyer showed none). Lowers confidence (Task 45). */
  yearInferred: boolean;
  /** Human-readable list of corrections, for logs and the review queue. */
  adjustments: string[];
}

const END_OF_DAY = { hour: 23, minute: 59 };

/** Next calendar occurrence of month/day on or after `after` (Chicago). Skips impossible dates (Feb 29). */
export function nextOccurrenceYear(month: number, day: number, after: Date): number | null {
  const startYear = chicagoWallClock(after).year;
  for (let year = startYear; year <= startYear + 8; year++) {
    const candidate = chicagoToUtc(year, month, day, END_OF_DAY.hour, END_OF_DAY.minute);
    const back = chicagoWallClock(candidate);
    if (back.month !== month || back.day !== day) continue; // e.g. Feb 29 in a non-leap year rolled over
    if (candidate.getTime() >= after.getTime()) return year;
  }
  return null;
}

/** Re-anchor an instant to a different year, keeping its Chicago month/day/time. */
function withYear(iso: string, year: number): string | null {
  const w = chicagoWallClock(new Date(iso));
  const moved = chicagoToUtc(year, w.month, w.day, w.hour, w.minute);
  const check = chicagoWallClock(moved);
  return check.month === w.month && check.day === w.day ? moved.toISOString() : null;
}

type Stage = Extraction["stages"][number];

const LOCAL_ISO =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parse a model timestamp. Models routinely write the wrong UTC offset across daylight saving
 * (for example -06:00 in March). When the offset is one of Chicago's (-05:00 / -06:00) we trust the
 * wall-clock time as written and apply the real Chicago offset for that date. Any other offset
 * (Z, +00:00, ...) is an explicit instant and is kept as is.
 */
export function parseModelTimestamp(iso: string): Date | null {
  const m = LOCAL_ISO.exec(iso);
  if (m && (m[6] === "-06:00" || m[6] === "-05:00")) {
    const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
    const out = chicagoToUtc(y, mo, d, h, mi);
    const back = chicagoWallClock(out);
    return back.month === mo && back.day === d ? out : null; // rejects impossible dates like Feb 30
  }
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * Deterministic clean-up after the model (engineering_spec §4, product_spec §4):
 * - dates whose year the model had to guess are re-anchored to the next occurrence after the post date;
 * - date-only deadlines (00:00) become end of day; reversed ranges are swapped;
 * - duplicate and invalid stages are dropped; stages are sorted and normalized to UTC.
 * Results recaps and non-competitions are returned untouched.
 */
export function postProcessExtraction(
  input: Extraction,
  ctx: { postedAt?: string | null; now?: Date } = {},
): PostProcessResult {
  const adjustments: string[] = [];
  if (input.kind !== "competition") return { extraction: input, yearInferred: false, adjustments };

  const now = ctx.now ?? new Date();
  const postedDate =
    ctx.postedAt && !Number.isNaN(Date.parse(ctx.postedAt)) ? new Date(ctx.postedAt) : now;
  const modelGuessedYear = input.missing_fields.some((f) => f.toLowerCase() === "year");

  // 1. Normalize and validate every stage.
  let stages: Stage[] = [];
  for (const s of input.stages) {
    const parsedDeadline = parseModelTimestamp(s.deadline_at);
    if (!parsedDeadline) {
      adjustments.push(`dropped stage "${s.name}": invalid deadline`);
      continue;
    }
    let deadline = parsedDeadline;
    let start = s.starts_at ? parseModelTimestamp(s.starts_at) : null;

    // Date-only deadline (midnight Chicago) means "that day", i.e. end of day.
    const w = chicagoWallClock(deadline);
    if (w.hour === 0 && w.minute === 0) {
      deadline = chicagoToUtc(w.year, w.month, w.day, END_OF_DAY.hour, END_OF_DAY.minute);
      adjustments.push(`"${s.name}": midnight deadline moved to 23:59`);
    }
    if (start && start.getTime() > deadline.getTime()) {
      [start, deadline] = [deadline, start];
      adjustments.push(`"${s.name}": start and end were reversed`);
    }
    stages.push({
      name: s.name,
      starts_at: start?.toISOString() ?? null,
      deadline_at: deadline.toISOString(),
    });
  }

  // 2. Year inference: only when the flyer showed no year (the model said so).
  let yearInferred = false;
  if (modelGuessedYear && stages.length > 0) {
    yearInferred = true;
    // Keep the flyer's own order: each stage must fall after the previous one, so a Dec stage followed
    // by a Jan stage rolls the Jan stage into the next year.
    let after = postedDate;
    stages = stages.map((s) => {
      // Anchor on the stage's first day (start if any, else deadline) so ranges stay together.
      const anchorIso = s.starts_at ?? s.deadline_at;
      const aw = chicagoWallClock(new Date(anchorIso));
      const year = nextOccurrenceYear(aw.month, aw.day, after);
      if (year === null) return s;
      const shift = year - aw.year;
      const newDeadline = withYear(
        s.deadline_at,
        chicagoWallClock(new Date(s.deadline_at)).year + shift,
      );
      const newStart = s.starts_at ? withYear(s.starts_at, aw.year + shift) : null;
      if (!newDeadline || (s.starts_at && !newStart)) return s;
      if (shift !== 0) adjustments.push(`"${s.name}": year set to ${year}`);
      after = new Date(newStart ?? newDeadline); // later stages must not precede earlier ones
      return { ...s, starts_at: newStart, deadline_at: newDeadline };
    });
  }

  // 3. Drop exact duplicates and sort.
  const seen = new Set<string>();
  stages = stages.filter((s) => {
    const key = `${s.name.trim().toLowerCase()}|${s.deadline_at}`;
    if (seen.has(key)) {
      adjustments.push(`dropped duplicate stage "${s.name}"`);
      return false;
    }
    seen.add(key);
    return true;
  });
  stages.sort((a, b) => a.deadline_at.localeCompare(b.deadline_at));

  return { extraction: { ...input, stages }, yearInferred, adjustments };
}
