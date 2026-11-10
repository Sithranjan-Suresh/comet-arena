import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PushStore } from "./push";

/** Subscriptions through whichever client the caller has (their own RLS client, or the service role in a job). */
export function supabasePushStore(db: SupabaseClient<Database>): PushStore {
  return {
    async listFor(userId) {
      const { data, error } = await db
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        sub: { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
      }));
    },
    async remove(id) {
      const { error } = await db.from("push_subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
  };
}
