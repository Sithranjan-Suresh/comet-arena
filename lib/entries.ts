import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntryInput } from "@/lib/schemas";
import { chicagoWallClock } from "@/lib/tz";
import type { Database } from "@/lib/supabase/database.types";

/** Academic season of a date, in Central Time: Jan-May Spring, Jun-Aug Summer, Sep-Dec Fall. */
export function seasonFor(date: Date): string {
  const { year, month } = chicagoWallClock(date);
  const name = month <= 5 ? "Spring" : month <= 8 ? "Summer" : "Fall";
  return `${name} ${year}`;
}

export interface EntryRow {
  id: string;
  competition_id: string;
  team_name: string;
  result: EntryInput["result"];
  rounds_advanced: number;
  verified_by_host: boolean;
  points: number | null;
  season: string;
  created_at: string;
  competition: { slug: string; title: string } | null;
}

export type EntryResult<T> = { ok: true; entry: T } | { ok: false; reason: "not_found" | "failed" };

const COLS =
  "id,competition_id,team_name,result,rounds_advanced,verified_by_host,points,season,created_at,competition:competitions(slug,title)";
const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const normalize = (r: unknown): EntryRow => {
  const row = r as Omit<EntryRow, "competition"> & {
    competition: EntryRow["competition"] | EntryRow["competition"][];
  };
  return { ...row, competition: one(row.competition) };
};

/**
 * Record (or update) the student's own result for a competition. Self-reported entries are always
 * `verified_by_host = false` with no points: those fields are never sent from here and RLS rejects them.
 */
export async function upsertEntry(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: EntryInput,
  now: Date = new Date(),
): Promise<EntryResult<EntryRow>> {
  const { data: comp, error: cErr } = await supabase
    .from("competitions")
    .select("id,stages(deadline_at)")
    .eq("id", input.competition_id)
    .maybeSingle();
  if (cErr) return { ok: false, reason: "failed" };
  if (!comp) return { ok: false, reason: "not_found" };

  // Season follows the competition's last date so a Fall competition stays "Fall" however late it is logged.
  const stages = ((comp as unknown as { stages: { deadline_at: string }[] | null }).stages ?? [])
    .map((s) => s.deadline_at)
    .sort();
  const season = seasonFor(stages.length ? new Date(stages[stages.length - 1]) : now);

  const { data, error } = await supabase
    .from("entries")
    .upsert(
      {
        user_id: userId,
        competition_id: input.competition_id,
        team_name: input.team_name,
        result: input.result,
        rounds_advanced: input.rounds_advanced,
        season,
      },
      { onConflict: "user_id,competition_id" },
    )
    .select(COLS)
    .single();
  if (error || !data) return { ok: false, reason: "failed" };
  return { ok: true, entry: normalize(data) };
}

export async function listEntries(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<EntryRow[] | null> {
  const { data, error } = await supabase
    .from("entries")
    .select(COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return error ? null : (data ?? []).map(normalize);
}

export async function patchEntry(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  patch: { team_name?: string; result?: EntryInput["result"]; rounds_advanced?: number },
): Promise<EntryResult<EntryRow>> {
  if (Object.keys(patch).length === 0) return { ok: false, reason: "failed" };
  const { data, error } = await supabase
    .from("entries")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select(COLS)
    .maybeSingle();
  if (error) return { ok: false, reason: "failed" };
  return data ? { ok: true, entry: normalize(data) } : { ok: false, reason: "not_found" };
}

export async function deleteEntry(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
): Promise<EntryResult<true>> {
  const { data, error } = await supabase
    .from("entries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) return { ok: false, reason: "failed" };
  return (data ?? []).length ? { ok: true, entry: true } : { ok: false, reason: "not_found" };
}
