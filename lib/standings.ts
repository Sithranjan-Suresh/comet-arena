import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

export const DIMENSIONS = ["org", "major", "category"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const standingsQuerySchema = z.object({
  dimension: z.enum(DIMENSIONS).catch("org"),
  /** "Fall 2026", or absent for all time. */
  season: z
    .string()
    .trim()
    .regex(/^(Spring|Summer|Fall) \d{4}$/)
    .optional()
    .catch(undefined),
});
export type StandingsQuery = z.infer<typeof standingsQuerySchema>;

export interface StandingRow {
  key: string;
  label: string;
  points: number;
  wins: number;
  podiums: number;
  entries: number;
  students: number;
}

const num = (v: unknown) => Number(v ?? 0);

/** Mock mode only: sample standings from fixtures/standings.json (clearly labeled "sample"), so the page demos without a database. */
export function fixtureStandings(q: StandingsQuery): { rows: StandingRow[]; seasons: string[] } {
  const f = JSON.parse(
    readFileSync(path.resolve(process.cwd(), "fixtures/standings.json"), "utf8"),
  ) as { seasons: string[] } & Record<Dimension, StandingRow[]>;
  return {
    rows: q.season && !f.seasons.includes(q.season) ? [] : f[q.dimension],
    seasons: f.seasons,
  };
}

export async function getStandings(
  db: SupabaseClient<Database>,
  q: StandingsQuery,
): Promise<{ rows: StandingRow[]; seasons: string[] } | null> {
  const [s, seasons] = await Promise.all([
    db.rpc("standings", {
      p_dimension: q.dimension,
      p_season: q.season ?? null,
      p_limit: 50,
    } as never),
    db.rpc("standings_seasons"),
  ]);
  if (s.error || seasons.error) return null;
  const rows = ((s.data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    key: String(r.key),
    label: String(r.label ?? r.key),
    points: num(r.points),
    wins: num(r.wins),
    podiums: num(r.podiums),
    entries: num(r.entries),
    students: num(r.students),
  }));
  return {
    rows,
    seasons: ((seasons.data ?? []) as unknown as { season: string }[]).map((x) => x.season),
  };
}

/** "AIS members won 7 competitions this season": the headline stat for the top row. */
export function headline(
  row: StandingRow | undefined,
  dimension: Dimension,
  season?: string,
): string | null {
  if (!row || row.wins === 0) return null;
  const when = season ? `in ${season}` : "so far";
  const noun = row.wins === 1 ? "competition" : "competitions";
  if (dimension === "org") return `${row.label} members won ${row.wins} ${noun} ${when}.`;
  if (dimension === "major") return `${row.label} majors won ${row.wins} ${noun} ${when}.`;
  return `${row.wins} ${row.label.replace(/_/g, " ")} ${noun} have been won ${when}.`;
}
