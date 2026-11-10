import type { SupabaseClient } from "@supabase/supabase-js";
import { type ExistingCompetition, toPgVector } from "@/lib/dedupe";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { PublishStore } from "./publish";

/** PublishStore on the service-role client; writes go through the atomic SQL functions. */
export function supabasePublishStore(db: SupabaseClient<Database>): PublishStore {
  return {
    async publishCompetition({ competition, stages, eligibility, sources }) {
      const { embedding, ...rest } = competition;
      const { data, error } = await db.rpc("publish_competition", {
        p: {
          competition: { ...rest, embedding: embedding ? toPgVector(embedding) : null },
          stages,
          eligibility,
          sources,
        } as unknown as Json,
      });
      if (error) throw error;
      const row = (data as unknown as { id: string; slug: string }[])[0];
      return { id: row.id, slug: row.slug };
    },

    async getForMerge(id) {
      const { data, error } = await db
        .from("competitions")
        .select(
          "host_name,description,prize,location,register_url,flyer_url,categories,cost,format",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as ExistingCompetition;
    },

    async mergeInto(id, patch, source) {
      const { error } = await db.rpc("merge_into_competition", {
        p_id: id,
        p_patch: patch as unknown as Json,
        p_source: source as unknown as Json,
      });
      if (error) throw error;
    },

    async addSource(id, source) {
      const { error } = await db
        .from("competition_sources")
        .insert({ competition_id: id, ...source });
      // A duplicate external id means we already attached this post: treat as success.
      if (error && error.code !== "23505") throw error;
    },

    async enqueueReview({ kind, candidate_competition_id, payload }) {
      const { data, error } = await db
        .from("review_queue")
        .insert({ kind, candidate_competition_id, payload: payload as Json })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
  };
}
