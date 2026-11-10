import { APP_TZ, chicagoDateParts } from "@/lib/tz";
import { REPAIR_MARKER } from "@/lib/sources/mock/constants";
import { CLASS_YEARS } from "@/lib/schemas";
import { categoryList } from "./categories";

export interface PromptInput {
  /** Injected so prompts are reproducible in tests; defaults to the current time. */
  now?: Date;
  caption?: string | null;
  sourceUrl?: string | null;
  /** When the post was published (ISO). Used to infer missing years. */
  postedAt?: string | null;
  imageCount: number;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Tuesday, 2026-11-10" in America/Chicago. */
export function todayLine(now: Date): string {
  const { year, month, day } = chicagoDateParts(now);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const OUTPUT_SHAPE = `{
  "is_competition": boolean,
  "kind": "competition" | "results" | "not_competition",
  "title": string | null,
  "host": string | null,
  "categories": string[],            // from the category list only
  "description": string | null,      // one or two plain sentences
  "stages": [ { "name": string, "starts_at": ISO-8601 with offset | null, "deadline_at": ISO-8601 with offset } ],
  "eligibility": { "majors": string[], "class_years": string[], "team_min": number | null, "team_max": number | null },
  "prize": string | null,
  "cost": "free" | "paid" | "unknown",
  "format": "in_person" | "virtual" | "hybrid" | "unknown",
  "location": string | null,
  "register_url": string | null,
  "confidence": number,              // 0 to 1, your honest self-assessment
  "missing_fields": string[]         // every field you could not read from the post
}`;

export function buildSystemPrompt(now: Date): string {
  return `You extract structured data about student competitions from social media posts (flyer images plus caption) for UT Dallas students.

Today is ${todayLine(now)}. All times are in the ${APP_TZ} time zone (Central Time, UTC-6 in winter and UTC-5 in daylight saving). Write every timestamp as ISO-8601 with the correct offset, for example 2026-11-20T23:59:00-06:00.

Decide what the post is:
- "competition": announces a competition, hackathon, case comp, pitch, contest or similar that students can enter.
- "results": a recap or congratulations for a competition that already happened. Never treat it as a new competition.
- "not_competition": anything else (meetings, social events, officer applications, general announcements).
Set is_competition to true only for kind "competition".

Categories (use only these ids; pick every one that clearly applies):
${categoryList()}

Rules:
1. NEVER invent a date, time, link, prize or any other fact. If something is not visible in the images or caption, use null (or an empty array) and add the field name to missing_fields.
2. Stages are the rounds that have a date: registration or application deadline, case release, rounds, semifinals, finals. One stage per distinct date. deadline_at is when that stage ends or is due. For a stage that spans days (for example "Nov 7-8") use ONE stage with starts_at = the first day and deadline_at = the end of the last day.
3. If a date has no year, use the next occurrence of that date on or after the post date. If the post date is unknown, use the next occurrence after today. Add "year" to missing_fields when you had to infer it.
4. If a time of day is not given, use 23:59 for deadlines and 09:00 for starts.
5. register_url must be a full URL that appears in the post. A link "in bio" with no URL visible is null. Add "register_url" to missing_fields.
6. eligibility.class_years may only contain: ${CLASS_YEARS.join(", ")}. Leave arrays empty when the post says open to everyone.
7. If the images conflict with the caption, trust the flyer image for dates and the caption for links.
8. confidence is how sure you are that the title, first deadline and register link are correct. Be conservative: messy, partial or ambiguous posts score below 0.6.

Respond with ONLY one JSON object, no prose and no code fences, in exactly this shape:
${OUTPUT_SHAPE}`;
}

export function buildUserPrompt(input: PromptInput): string {
  const lines: string[] = [];
  lines.push(`Post date: ${input.postedAt ?? "unknown"}`);
  if (input.sourceUrl) lines.push(`Source URL: ${input.sourceUrl}`);
  lines.push(
    `Images attached: ${input.imageCount}${input.imageCount > 1 ? " (a carousel: read all of them)" : ""}`,
  );
  lines.push("");
  lines.push("Caption:");
  lines.push(input.caption?.trim() ? input.caption.trim() : "(no caption)");
  return lines.join("\n");
}

export function buildExtractionPrompt(input: PromptInput): { system: string; user: string } {
  const now = input.now ?? new Date();
  return { system: buildSystemPrompt(now), user: buildUserPrompt(input) };
}

/** One repair attempt after schema validation fails (engineering_spec §4). */
export function buildRepairPrompt(
  base: { system: string; user: string },
  previousOutput: string,
  error: string,
) {
  return {
    system: base.system,
    user: `${base.user}

${REPAIR_MARKER}. Validation error:
${error}

Previous output:
${previousOutput.slice(0, 4000)}

Return the corrected JSON object only, in the exact shape described. Do not add facts that are not in the post.`,
  };
}
