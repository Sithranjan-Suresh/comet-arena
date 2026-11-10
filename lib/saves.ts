import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

export const saveInputSchema = z.object({ competition_id: z.string().uuid() });
export const uuidSchema = z.string().uuid();

export type SaveResult = { ok: true } | { ok: false; reason: "not_found" | "failed" };

/**
 * Save a competition for the current user. Idempotent: saving twice is a no-op, not an error.
 * `supabase` must be the user's RLS-bound client (policy `saves_own` enforces user_id = auth.uid()).
 */
export async function saveCompetition(
  supabase: SupabaseClient<Database>,
  userId: string,
  competitionId: string,
): Promise<SaveResult> {
  const { error } = await supabase
    .from("saves")
    .upsert(
      { user_id: userId, competition_id: competitionId },
      { onConflict: "user_id,competition_id", ignoreDuplicates: true },
    );
  if (!error) return { ok: true };
  // 23503 = foreign key violation: the competition does not exist.
  return { ok: false, reason: error.code === "23503" ? "not_found" : "failed" };
}

/** Unsave. Idempotent: removing something that is not saved succeeds. */
export async function unsaveCompetition(
  supabase: SupabaseClient<Database>,
  userId: string,
  competitionId: string,
): Promise<SaveResult> {
  const { error } = await supabase
    .from("saves")
    .delete()
    .eq("user_id", userId)
    .eq("competition_id", competitionId);
  return error ? { ok: false, reason: "failed" } : { ok: true };
}

/** Ids of every competition the user saved (drives the Save button state on cards). */
export async function listSavedIds(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("saves")
    .select("competition_id")
    .eq("user_id", userId);
  if (error) return null;
  return (data ?? []).map((r) => r.competition_id);
}
