import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { HandleStore } from "./org-handles";

/** Service-role store. A human-entered handle is flagged so sync-orgs never overwrites it. */
export function supabaseHandleStore(db: SupabaseClient<Database>): HandleStore {
  return {
    async listOrgs() {
      const { data, error } = await db.from("orgs").select("id,name,slug,utdclubs_slug,ig_handle");
      if (error) throw error;
      return data ?? [];
    },
    async setHandle(orgId, handle, type) {
      const { error } = await db
        .from("orgs")
        .update({
          ig_handle: handle,
          ig_account_type: handle ? type : "unknown",
          handle_manual: handle !== null,
        })
        .eq("id", orgId);
      if (error) throw error;
    },
  };
}
