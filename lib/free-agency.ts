import type { SupabaseClient } from "@supabase/supabase-js";
import type { FreeAgentPostInput, TeamOpeningPostInput } from "@/lib/schemas";
import type { Database } from "@/lib/supabase/database.types";

/** At most this many OPEN openings per student per competition (anti-spam). */
export const MAX_OPEN_OPENINGS = 3;

export type PostResult<T> =
  | { ok: true; post: T }
  | { ok: false; reason: "not_found" | "registration_closed" | "limit_reached" | "failed" };

export interface FreeAgentRow {
  id: string;
  competition_id: string;
  roles: string[];
  note: string;
  status: "open" | "closed";
}
export interface OpeningRow {
  id: string;
  competition_id: string;
  team_name: string;
  roles_needed: string[];
  note: string;
  status: "open" | "closed";
}

/**
 * Registration is closed once the FIRST stage (registration) has passed. A competition with no dated stage
 * (expected) is open for posting: students can team up before dates are announced.
 */
export function registrationClosed(
  stages: { order: number; deadline_at: string }[],
  now: Date = new Date(),
): boolean {
  if (stages.length === 0) return false;
  const first = [...stages].sort(
    (a, b) => a.order - b.order || a.deadline_at.localeCompare(b.deadline_at),
  )[0];
  return new Date(first.deadline_at).getTime() < now.getTime();
}

async function competitionState(
  supabase: SupabaseClient<Database>,
  competitionId: string,
  now: Date,
): Promise<"ok" | "not_found" | "registration_closed"> {
  const { data, error } = await supabase
    .from("competitions")
    .select("id,status,stages(order,deadline_at)")
    .eq("id", competitionId)
    .maybeSingle();
  if (error || !data) return "not_found";
  const row = data as unknown as {
    status: string;
    stages: { order: number; deadline_at: string }[] | null;
  };
  if (row.status === "past") return "registration_closed";
  return registrationClosed(row.stages ?? [], now) ? "registration_closed" : "ok";
}

const FA_COLS = "id,competition_id,roles,note,status";
const OP_COLS = "id,competition_id,team_name,roles_needed,note,status";

/** Post (or re-open and update) the student's single free-agent post for a competition. */
export async function upsertFreeAgent(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: FreeAgentPostInput,
  now: Date = new Date(),
): Promise<PostResult<FreeAgentRow>> {
  const state = await competitionState(supabase, input.competition_id, now);
  if (state !== "ok") return { ok: false, reason: state };
  const { data, error } = await supabase
    .from("free_agents")
    .upsert(
      {
        user_id: userId,
        competition_id: input.competition_id,
        roles: input.roles,
        note: input.note,
        status: "open",
      },
      { onConflict: "user_id,competition_id" },
    )
    .select(FA_COLS)
    .single();
  if (error || !data) return { ok: false, reason: "failed" };
  return { ok: true, post: data as FreeAgentRow };
}

/** Post a team opening. The poster is the contact. */
export async function createTeamOpening(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: TeamOpeningPostInput,
  now: Date = new Date(),
): Promise<PostResult<OpeningRow>> {
  const state = await competitionState(supabase, input.competition_id, now);
  if (state !== "ok") return { ok: false, reason: state };

  const { count, error: cErr } = await supabase
    .from("team_openings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("competition_id", input.competition_id)
    .eq("status", "open");
  if (cErr) return { ok: false, reason: "failed" };
  if ((count ?? 0) >= MAX_OPEN_OPENINGS) return { ok: false, reason: "limit_reached" };

  const { data, error } = await supabase
    .from("team_openings")
    .insert({
      user_id: userId,
      competition_id: input.competition_id,
      team_name: input.team_name,
      roles_needed: input.roles_needed,
      note: input.note,
    })
    .select(OP_COLS)
    .single();
  if (error || !data) return { ok: false, reason: "failed" };
  return { ok: true, post: data as OpeningRow };
}

/** Edit or close your own free-agent post. Scoped by user id as well as RLS, so other students' ids give 404. */
export async function patchFreeAgent(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  patch: { roles?: string[]; note?: string; status?: "open" | "closed" },
): Promise<PostResult<FreeAgentRow>> {
  if (Object.keys(patch).length === 0) return { ok: false, reason: "failed" };
  const { data, error } = await supabase
    .from("free_agents")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select(FA_COLS)
    .maybeSingle();
  if (error) return { ok: false, reason: "failed" };
  return data ? { ok: true, post: data as FreeAgentRow } : { ok: false, reason: "not_found" };
}

export async function patchTeamOpening(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  patch: { team_name?: string; roles_needed?: string[]; note?: string; status?: "open" | "closed" },
): Promise<PostResult<OpeningRow>> {
  if (Object.keys(patch).length === 0) return { ok: false, reason: "failed" };
  const { data, error } = await supabase
    .from("team_openings")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select(OP_COLS)
    .maybeSingle();
  if (error) return { ok: false, reason: "failed" };
  return data ? { ok: true, post: data as OpeningRow } : { ok: false, reason: "not_found" };
}

export const REASON_STATUS = {
  not_found: 404,
  registration_closed: 409,
  limit_reached: 409,
  failed: 500,
} as const;
export const REASON_MESSAGE = {
  not_found: "We could not find that.",
  registration_closed: "Registration for this competition has closed, so new posts are closed too.",
  limit_reached: `You already have ${MAX_OPEN_OPENINGS} open team openings for this competition. Close one first.`,
  failed: "Something went wrong. Please try again.",
} as const;
