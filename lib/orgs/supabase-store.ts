import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type { OrgRecord } from "./merge";
import type { OrgStore } from "./sync";

/** OrgStore backed by the `orgs` table (service-role client). */
export function supabaseOrgStore(db: SupabaseClient<Database>): OrgStore {
  return {
    async loadAll() {
      const { data, error } = await db
        .from("orgs")
        .select("slug,name,utdclubs_slug,campusgroups_id,ig_handle,discord_url,tags,handle_manual");
      if (error) throw error;
      return data as OrgRecord[];
    },
    async upsertMany(rows) {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await db
          .from("orgs")
          .upsert(rows.slice(i, i + 200), { onConflict: "slug" });
        if (error) throw error;
      }
    },
  };
}
