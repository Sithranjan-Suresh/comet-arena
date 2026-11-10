import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublishStore } from "@/lib/pipeline/supabase-store";
import { getSources } from "@/lib/sources";
import type { Database } from "@/lib/supabase/database.types";
import type { ReviewDeps, ReviewItem } from "./review";

/** Production wiring: service-role client (the route has already verified the caller is an admin). */
export function createReviewDeps(db: SupabaseClient<Database>): ReviewDeps {
  return {
    async getItem(id) {
      const { data, error } = await db
        .from("review_queue")
        .select("id,kind,status,payload,candidate_competition_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as ReviewItem | null;
    },
    async resolve(id) {
      // Only an open item can be resolved: a concurrent admin loses the race instead of double-publishing.
      const { data, error } = await db
        .from("review_queue")
        .update({ status: "done", resolved_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "open")
        .select("id");
      if (error) throw error;
      return (data ?? []).length === 1;
    },
    store: supabasePublishStore(db),
    async hideCompetition(id) {
      const { error } = await db.from("competitions").update({ status: "rejected" }).eq("id", id);
      if (error) throw error;
    },
    embedder: getSources().embedder,
    async lookupSlug(competitionId) {
      const { data } = await db
        .from("competitions")
        .select("slug")
        .eq("id", competitionId)
        .maybeSingle();
      return data?.slug ?? null;
    },
  };
}
