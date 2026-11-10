import { z } from "zod";
import { CATEGORIES, COSTS, FORMATS } from "./enums";

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;

const bool = z.enum(["1", "true", "0", "false"]).transform((v) => v === "1" || v === "true");

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/** Query-string contract for GET /api/competitions and the Field page URL (shareable filters). */
export const competitionQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  /** Repeated (?categories=a&categories=b) or comma-separated. Unknown values are ignored, not errors. */
  categories: z.array(z.string()).default([]),
  format: z.enum(FORMATS).optional(),
  cost: z.enum(COSTS).optional(),
  utd_only: bool.optional(),
  beginner: bool.optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
  include_past: bool.default(false),
  host: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});
export type CompetitionQuery = z.infer<typeof competitionQuerySchema>;

/** Parse URLSearchParams leniently: repeated + comma-separated categories, unknown categories dropped. */
export function parseCompetitionQuery(
  params: URLSearchParams,
): z.ZodSafeParseResult<CompetitionQuery> {
  const raw: Record<string, unknown> = {};
  for (const key of [
    "q",
    "format",
    "cost",
    "utd_only",
    "beginner",
    "from",
    "to",
    "include_past",
    "host",
    "cursor",
    "limit",
  ]) {
    const v = params.get(key);
    if (v !== null && v !== "") raw[key] = v;
  }
  const cats = params
    .getAll("categories")
    .flatMap((c) => c.split(","))
    .map((c) => c.trim())
    .filter((c): c is (typeof CATEGORIES)[number] => (CATEGORIES as readonly string[]).includes(c));
  raw.categories = [...new Set(cats)];
  return competitionQuerySchema.safeParse(raw);
}

/** Opaque offset cursor. (Result sets are in the hundreds, so offset paging is fine.) */
export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const o = (JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown }).o;
    return typeof o === "number" && Number.isInteger(o) && o >= 0 && o < 100_000 ? o : 0;
  } catch {
    return 0;
  }
}
