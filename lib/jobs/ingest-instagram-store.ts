import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { IngestInstagramStore } from "./ingest-instagram";

export function supabaseIngestInstagramStore(db: SupabaseClient<Database>): IngestInstagramStore {
  return {
    async listOrgs() {
      const { data, error } = await db
        .from("orgs")
        .select("id,name,ig_handle,ig_account_type")
        .not("ig_handle", "is", null)
        .order("id");
      if (error) throw error;
      return (data ?? []).filter((o) => o.ig_handle) as never;
    },
    async knownPostIds(ids) {
      if (ids.length === 0) return new Set();
      const { data, error } = await db
        .from("ingest_posts")
        .select("ig_post_id")
        .in("ig_post_id", ids)
        .neq("classification", "error");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.ig_post_id));
    },
    async recordPost({ post, orgId, result }) {
      const { error } = await db.from("ingest_posts").upsert(
        {
          ig_post_id: post.id,
          org_id: orgId,
          caption: post.caption,
          media_urls: post.mediaUrls,
          permalink: post.permalink,
          posted_at: post.postedAt,
          classification: result.class,
          competition_id: result.competitionId,
        },
        { onConflict: "ig_post_id" },
      );
      if (error) throw error;
    },
    async setAccountType(orgId, type) {
      const { error } = await db.from("orgs").update({ ig_account_type: type }).eq("id", orgId);
      if (error) throw error;
    },
  };
}
