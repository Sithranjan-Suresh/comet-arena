import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { type DedupeMatch, type DedupeStore, toPgVector } from "./dedupe";

/** DedupeStore backed by the `match_competitions` SQL function (service role only). */
export function supabaseDedupeStore(db: SupabaseClient<Database>): DedupeStore {
  return {
    async findMatches({ embedding, around, windowDays, minSimilarity }) {
      const { data, error } = await db.rpc("match_competitions", {
        p_embedding: toPgVector(embedding),
        p_around: around.toISOString(),
        p_window_days: windowDays,
        p_min_similarity: minSimilarity,
        p_limit: 5,
      });
      if (error) throw error;
      return ((data ?? []) as unknown as DedupeMatch[]).map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        host_name: r.host_name ?? null,
        nearest_deadline: r.nearest_deadline ?? null,
        similarity: Number(r.similarity),
      }));
    },
  };
}
