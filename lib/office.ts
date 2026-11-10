import { z } from "zod";
import { parseCsv } from "@/lib/admin/org-handles";
import { categorySchema, costSchema, entryResultSchema, formatSchema } from "@/lib/schemas";

const iso = z.string().datetime({ offset: true });

/** Fields an officer may change. Everything is optional; only the keys sent are touched. */
export const officerEditSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().max(2000).nullable(),
    prize: z.string().trim().max(120).nullable(),
    location: z.string().trim().max(160).nullable(),
    register_url: z
      .string()
      .trim()
      .url()
      .max(500)
      .refine((u) => /^https?:\/\//i.test(u), { message: "Use an http or https link" })
      .nullable(),
    cost: costSchema,
    format: formatSchema,
    categories: z.array(categorySchema).min(1).max(4),
    stages: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          starts_at: iso.nullable().optional(),
          deadline_at: iso,
        }),
      )
      .min(1)
      .max(10),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Change at least one field" });
export type OfficerEdit = z.infer<typeof officerEditSchema>;

export const MAX_RESULT_ROWS = 1000;

export const resultRowSchema = z.object({
  email: z.string().trim().email().max(200),
  result: entryResultSchema,
  rounds_advanced: z.number().int().min(0).max(20).optional(),
  points: z.number().int().min(0).max(100000).nullable().optional(),
  team_name: z.string().trim().max(80).optional(),
  /** The club the student competed for (slug or name); counts toward that club's standings. */
  club: z.string().trim().max(120).optional(),
});
export type ResultRow = z.infer<typeof resultRowSchema>;

export const resultsBodySchema = z.union([
  z.object({ csv: z.string().min(1).max(300_000) }),
  z.object({ rows: z.array(z.unknown()).min(1).max(MAX_RESULT_ROWS) }),
]);

const RESULT_ALIASES: Record<string, string> = {
  "1st": "first",
  "1": "first",
  winner: "first",
  first: "first",
  "2nd": "second",
  "2": "second",
  second: "second",
  "3rd": "third",
  "3": "third",
  third: "third",
  finalist: "finalist",
  finalists: "finalist",
  advanced: "advanced",
  participated: "participated",
  participant: "participated",
  participation: "participated",
};

/** Normalize a free-text result ("1st", "Winner", "Finalist") to the enum; null when unrecognized. */
export function normalizeResult(s: string): string | null {
  return RESULT_ALIASES[s.trim().toLowerCase()] ?? null;
}

export interface ParsedResults {
  rows: ResultRow[];
  skipped: { line: number; reason: string; value?: string }[];
}

/** `email,result[,rounds,points,team]` (header optional). Bad rows are listed and skipped, never abort the upload. */
export function parseResultsCsv(csv: string): ParsedResults {
  const table = parseCsv(csv);
  const out: ParsedResults = { rows: [], skipped: [] };
  if (table.length === 0) return out;
  const header = /^e-?mail$/i.test(table[0][0]?.trim() ?? "");
  const start = header ? 1 : 0;
  if (table.length - start > MAX_RESULT_ROWS) {
    out.skipped.push({
      line: 0,
      reason: `Too many rows (max ${MAX_RESULT_ROWS}). Split the file.`,
    });
    return out;
  }
  const seen = new Set<string>();
  for (let i = start; i < table.length; i++) {
    const line = i + 1;
    const [email = "", resultRaw = "", roundsRaw = "", pointsRaw = "", team = "", club = ""] =
      table[i].map((c) => c.trim());
    const result = normalizeResult(resultRaw);
    if (!result) {
      out.skipped.push({
        line,
        reason: "Result must be one of: 1st, 2nd, 3rd, finalist, advanced, participated",
        value: resultRaw,
      });
      continue;
    }
    if (roundsRaw !== "" && !/^\d{1,2}$/.test(roundsRaw)) {
      out.skipped.push({
        line,
        reason: "Rounds advanced must be a whole number",
        value: roundsRaw,
      });
      continue;
    }
    if (pointsRaw !== "" && !/^\d{1,6}$/.test(pointsRaw)) {
      out.skipped.push({ line, reason: "Points must be a whole number", value: pointsRaw });
      continue;
    }
    const parsed = resultRowSchema.safeParse({
      email,
      result,
      rounds_advanced: roundsRaw === "" ? undefined : Number(roundsRaw),
      points: pointsRaw === "" ? undefined : Number(pointsRaw),
      team_name: team || undefined,
      club: club || undefined,
    });
    if (!parsed.success) {
      out.skipped.push({ line, reason: "Not a valid email address", value: email });
      continue;
    }
    const key = parsed.data.email.toLowerCase();
    if (seen.has(key)) {
      out.skipped.push({ line, reason: "This email appears more than once", value: email });
      continue;
    }
    seen.add(key);
    out.rows.push(parsed.data);
  }
  return out;
}

/** SQLSTATE from the officer_* functions to an HTTP status. */
export function officerErrorStatus(code: string | undefined): {
  status: number;
  error: string;
  message: string;
} {
  if (code === "42501")
    return {
      status: 403,
      error: "forbidden",
      message: "You are not an officer of this competition's organization.",
    };
  if (code === "22023" || code === "22P02")
    return { status: 422, error: "invalid_input", message: "Some values were not valid." };
  return { status: 503, error: "unavailable", message: "Something went wrong. Try again." };
}
