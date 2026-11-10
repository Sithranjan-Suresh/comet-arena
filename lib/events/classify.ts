import type { Category, Extraction } from "@/lib/schemas";
import type { CampusEvent } from "@/lib/sources";

export type EventVerdict = "competition" | "maybe" | "no";

/** Words that make an event a competition by themselves when they appear in the title. */
const STRONG =
  /\b(hackathon|datathon|case (?:competition|comp|challenge)|pitch (?:competition|night|contest)|business plan (?:competition|contest)|competition|contest|tournament|olympiad|capture the flag|ctf|invitational|showdown|grand prix|bake-?off|\w+thon)\b/i;
/** Softer signals: worth a second look, not worth publishing unattended. */
const WEAK =
  /\b(challenge|compete|competing|prize|prizes|winner|winners|judges?|teams? of|leaderboard|finals?)\b/i;
/** Titles that are plainly something else. */
const NEGATIVE_TITLE =
  /\b(general body|gbm|meeting|social|mixer|workshop|info(?:rmation)? session|career fair|office hours|volunteer|panel|study (?:session|break)|orientation|tabling|welcome|networking)\b/i;

/**
 * Cheap, deterministic classifier for calendar events (no model call, no cost per run).
 *  competition: a strong competition word in the title and the title is not obviously something else
 *  maybe:       weak signals only (an LLM or a person should decide)
 *  no:          everything else
 */
export function classifyEvent(e: Pick<CampusEvent, "title" | "description">): EventVerdict {
  const title = e.title;
  const strongTitle = STRONG.test(title);
  // "Hack Workshop" or "Case Competition Info Session" are about a competition, not the competition itself.
  if (strongTitle && NEGATIVE_TITLE.test(title)) return "maybe";
  if (strongTitle) return "competition";
  if (NEGATIVE_TITLE.test(title)) return "no";
  const text = `${title} ${e.description}`;
  if (WEAK.test(text) || STRONG.test(e.description)) return "maybe";
  return "no";
}

const CATEGORY_RULES: [RegExp, Category][] = [
  [/hackathon|hack\b|ctf|capture the flag|coding contest|programming/i, "hackathon"],
  [/case (?:competition|comp|challenge)|case study/i, "case_competition"],
  [/pitch|startup|business plan|entrepreneur/i, "pitch_competition"],
  [/datathon|data science|analytics|machine learning|\bai\b/i, "data_science"],
  [/design|ux|ui\b|poster/i, "design"],
  [/research|thesis|symposium/i, "research"],
  [/speech|debate|speaking|mock trial|oratory/i, "speaking"],
  [/invest|financ|trading|stock/i, "finance"],
  [/robot|engineering|rocket|circuit/i, "engineering"],
  [/health|medical|pre-?health|nursing/i, "health"],
];

export function categoriesFor(text: string): Category[] {
  const out: Category[] = [];
  for (const [re, c] of CATEGORY_RULES) if (re.test(text) && !out.includes(c)) out.push(c);
  return out.length ? out.slice(0, 3) : ["other"];
}

const PRIZE = /\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|K))?/;

/** Build an Extraction from an event's structured fields. The model score is high because dates, host and link are given, not read off a flyer. */
export function eventToExtraction(e: CampusEvent): Extraction {
  const text = `${e.title} ${e.description}`;
  const where = e.location ?? "";
  const virtual = /\b(online|virtual|zoom|teams)\b/i.test(where);
  const prize = e.description.match(PRIZE)?.[0] ?? null;
  const end = e.end ?? e.start;
  return {
    is_competition: true,
    kind: "competition",
    title: e.title.trim(),
    host: e.host,
    categories: categoriesFor(text),
    description: e.description.trim() || null,
    stages: [{ name: "Event day", starts_at: e.start, deadline_at: end }],
    eligibility: {
      majors: [],
      class_years: [],
      course_prereqs: [],
      team_min: null,
      team_max: null,
      cross_school: false,
    } as Extraction["eligibility"],
    prize,
    cost: /\bfree\b/i.test(text) ? "free" : "unknown",
    format: virtual ? "virtual" : where ? "in_person" : "unknown",
    location: where || null,
    register_url: e.url,
    confidence: 0.88,
    missing_fields: [],
  } as Extraction;
}
