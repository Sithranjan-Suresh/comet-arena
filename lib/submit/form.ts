import type { Extraction } from "@/lib/schemas";
import { chicagoToUtc, chicagoWallClock } from "@/lib/tz";
import { type ConfirmInput, confirmInputSchema } from "./schema";

/** A stage as the student edits it: wall-clock Central Time in <input type="datetime-local"> format. */
export interface StageForm {
  name: string;
  /** "YYYY-MM-DDTHH:mm" or "" */
  starts: string;
  deadline: string;
}

export interface FormValues {
  title: string;
  host: string;
  categories: string[];
  description: string;
  stages: StageForm[];
  majors: string;
  classYears: string[];
  teamMin: string;
  teamMax: string;
  prize: string;
  cost: "free" | "paid" | "unknown";
  format: "in_person" | "virtual" | "hybrid" | "unknown";
  location: string;
  registerUrl: string;
  noLinkYet: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant -> Chicago wall clock for a datetime-local input. */
export function chicagoLocalFromIso(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const w = chicagoWallClock(new Date(iso));
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** Chicago wall clock from a datetime-local input -> ISO UTC instant (DST-safe), or null if invalid. */
export function isoFromChicagoLocal(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const out = chicagoToUtc(y, mo, d, h, mi);
  const back = chicagoWallClock(out);
  return back.month === mo && back.day === d ? out.toISOString() : null; // rejects Feb 30, etc.
}

export const emptyStage = (): StageForm => ({ name: "", starts: "", deadline: "" });

export function emptyForm(): FormValues {
  return {
    title: "",
    host: "",
    categories: [],
    description: "",
    stages: [emptyStage()],
    majors: "",
    classYears: [],
    teamMin: "",
    teamMax: "",
    prize: "",
    cost: "unknown",
    format: "unknown",
    location: "",
    registerUrl: "",
    noLinkYet: false,
  };
}

/** Pre-fill the form from what the model read. */
export function extractionToForm(ex: Extraction | null): FormValues {
  if (!ex) return emptyForm();
  return {
    title: ex.title ?? "",
    host: ex.host ?? "",
    categories: [...ex.categories],
    description: ex.description ?? "",
    stages: ex.stages.length
      ? ex.stages.map((s) => ({
          name: s.name,
          starts: chicagoLocalFromIso(s.starts_at),
          deadline: chicagoLocalFromIso(s.deadline_at),
        }))
      : [emptyStage()],
    majors: ex.eligibility.majors.join(", "),
    classYears: [...ex.eligibility.class_years],
    teamMin: ex.eligibility.team_min?.toString() ?? "",
    teamMax: ex.eligibility.team_max?.toString() ?? "",
    prize: ex.prize ?? "",
    cost: ex.cost,
    format: ex.format,
    location: ex.location ?? "",
    registerUrl: ex.register_url ?? "",
    noLinkYet: !ex.register_url && ex.missing_fields.includes("register_url"),
  };
}

const num = (s: string) => (s.trim() === "" ? null : Number(s));

/** Form -> the payload the confirm endpoint expects (not yet validated). */
export function formToPayload(v: FormValues, extra: { merge_into?: string | null } = {}): unknown {
  return {
    title: v.title,
    host: v.host.trim() || null,
    categories: v.categories,
    description: v.description.trim() || null,
    stages: v.stages
      .filter((s) => s.name.trim() || s.deadline.trim() || s.starts.trim())
      .map((s) => ({
        name: s.name,
        starts_at: s.starts ? isoFromChicagoLocal(s.starts) : null,
        deadline_at: s.deadline ? (isoFromChicagoLocal(s.deadline) ?? "invalid") : "",
      })),
    eligibility: {
      majors: v.majors
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      class_years: v.classYears,
      team_min: num(v.teamMin),
      team_max: num(v.teamMax),
    },
    prize: v.prize.trim() || null,
    cost: v.cost,
    format: v.format,
    location: v.location.trim() || null,
    register_url: v.registerUrl.trim() || null,
    no_link_yet: v.noLinkYet,
    merge_into: extra.merge_into ?? null,
  };
}

export type FieldErrors = Record<string, string>;

/** Validate with the SAME schema the server uses. Errors are keyed by path ("title", "stages.0.deadline_at"). */
export function validateForm(
  v: FormValues,
  extra: { merge_into?: string | null } = {},
): { input: ConfirmInput; errors: null } | { input: null; errors: FieldErrors } {
  const result = confirmInputSchema.safeParse(formToPayload(v, extra));
  if (result.success) return { input: result.data, errors: null };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    // Friendlier wording for the common date mistake.
    const msg =
      /datetime|Invalid ISO|Invalid input/i.test(issue.message) && key.endsWith("deadline_at")
        ? "Enter the date and time this round ends"
        : issue.message;
    errors[key] ??= msg;
  }
  return { input: null, errors };
}

/**
 * Which form fields the model was unsure about, so the preview can highlight them.
 * Keys match FormValues names (title, stages, registerUrl, ...).
 */
export function fieldsNeedingReview(
  ex: Pick<Extraction, "missing_fields" | "confidence" | "stages" | "register_url" | "title">,
): Set<string> {
  const out = new Set<string>();
  const map: Record<string, string> = {
    title: "title",
    host: "host",
    description: "description",
    stages: "stages",
    register_url: "registerUrl",
    prize: "prize",
    location: "location",
    cost: "cost",
    format: "format",
    year: "stages",
    categories: "categories",
  };
  for (const f of ex.missing_fields) if (map[f]) out.add(map[f]);
  if (!ex.register_url) out.add("registerUrl");
  if (ex.stages.length === 0) out.add("stages");
  if (!ex.title) out.add("title");
  // Low overall confidence: the dates are what matter most, so flag them.
  if (ex.confidence < 0.8) out.add("stages");
  return out;
}

/** Add, remove or move a stage row without mutating the input. */
export function moveStage(stages: StageForm[], from: number, to: number): StageForm[] {
  if (from === to || from < 0 || to < 0 || from >= stages.length || to >= stages.length)
    return stages;
  const next = [...stages];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
