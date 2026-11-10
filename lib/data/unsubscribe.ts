import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { UnsubscribePayload } from "@/lib/unsubscribe";

/** Human-readable result for the confirmation page. */
export const UNSUBSCRIBE_MESSAGES: Record<UnsubscribePayload["k"], string> = {
  comp: "You will no longer get deadline warnings for this competition. It stays saved on your schedule.",
  warnings:
    "You will no longer get deadline warnings. Your saved competitions and calendar are unchanged.",
  digest: "You are unsubscribed from the weekly digest.",
  sub: "You are unsubscribed from Comet Arena Weekly.",
};

/** Apply a verified unsubscribe. Idempotent: running twice is harmless. Service-role client required. */
export async function applyUnsubscribe(
  db: SupabaseClient<Database>,
  p: UnsubscribePayload,
): Promise<void> {
  switch (p.k) {
    case "comp": {
      const { error } = await db
        .from("warning_mutes")
        .upsert(
          { user_id: p.u, competition_id: p.c },
          { onConflict: "user_id,competition_id", ignoreDuplicates: true },
        );
      if (error) throw error;
      return;
    }
    case "warnings": {
      const { error } = await db.from("users").update({ email_warnings: false }).eq("id", p.u);
      if (error) throw error;
      return;
    }
    case "digest": {
      const { error } = await db.from("users").update({ digest: false }).eq("id", p.u);
      if (error) throw error;
      return;
    }
    case "sub": {
      const { error } = await db.from("email_subscribers").delete().eq("email", p.e.toLowerCase());
      if (error) throw error;
      return;
    }
  }
}
