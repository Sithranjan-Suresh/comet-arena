import type { SupabaseClient } from "@supabase/supabase-js";
import type { WarningWindow } from "@/lib/schemas";
import type { Database } from "@/lib/supabase/database.types";
import { type Candidate, type WarningsDeps, sentKey } from "./send-warnings";

/** Service-role persistence for the warnings job. */
export function supabaseWarningsStore(
  db: SupabaseClient<Database>,
): Pick<WarningsDeps, "findCandidates" | "alreadySent" | "recordSent"> {
  return {
    async findCandidates(from, to) {
      const { data, error } = await db.rpc("stages_due_between", {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) throw error;
      return ((data ?? []) as unknown as Candidate[]).map((r) => ({ ...r }));
    },

    async alreadySent(window: WarningWindow, keys) {
      const out = new Set<string>();
      const stageIds = [...new Set(keys.map((k) => k.stage_id))];
      for (let i = 0; i < stageIds.length; i += 200) {
        const { data, error } = await db
          .from("warnings_sent")
          .select("user_id,stage_id")
          .eq("window", window)
          .in("stage_id", stageIds.slice(i, i + 200));
        if (error) throw error;
        for (const r of data ?? []) out.add(sentKey(r.user_id, r.stage_id));
      }
      return out;
    },

    async recordSent(row) {
      const { error } = await db
        .from("warnings_sent")
        .upsert(row, { onConflict: "user_id,stage_id,window", ignoreDuplicates: true });
      if (error) throw error;
    },
  };
}
