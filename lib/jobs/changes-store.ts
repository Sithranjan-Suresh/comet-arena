import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { NotifyDeps, PendingChange, Saver, StageSnapshot } from "./notify-changes";

interface Row {
  id: string;
  competition_id: string;
  created_at: string;
  summary: { before?: StageSnapshot[]; after?: StageSnapshot[] } | null;
  competition: { title: string; slug: string } | { title: string; slug: string }[] | null;
}

export function toPendingChange(r: Row): PendingChange | null {
  const c = Array.isArray(r.competition) ? r.competition[0] : r.competition;
  if (!c) return null;
  return {
    id: r.id,
    competition_id: r.competition_id,
    created_at: r.created_at,
    title: c.title,
    slug: c.slug,
    before: r.summary?.before ?? [],
    after: r.summary?.after ?? [],
  };
}

/** Service-role persistence for the dates-changed job. */
export function supabaseChangesStore(
  db: SupabaseClient<Database>,
): Pick<NotifyDeps, "loadPending" | "loadSavers" | "markNotified"> {
  return {
    async loadPending() {
      const { data, error } = await db
        .from("competition_changes")
        .select("id,competition_id,created_at,summary,competition:competitions(title,slug)")
        .is("notified_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as unknown as Row[])
        .map(toPendingChange)
        .filter((c): c is PendingChange => c !== null);
    },

    async loadSavers(competitionId) {
      const { data, error } = await db
        .from("saves")
        .select("user:users(id,email,name,email_warnings)")
        .eq("competition_id", competitionId);
      if (error) throw error;
      const { data: muted, error: mErr } = await db
        .from("warning_mutes")
        .select("user_id")
        .eq("competition_id", competitionId);
      if (mErr) throw mErr;
      const mutes = new Set((muted ?? []).map((m) => m.user_id));
      const out: Saver[] = [];
      for (const r of (data ?? []) as unknown as {
        user:
          | { id: string; email: string; name: string | null; email_warnings: boolean }
          | { id: string; email: string; name: string | null; email_warnings: boolean }[]
          | null;
      }[]) {
        const u = Array.isArray(r.user) ? r.user[0] : r.user;
        if (u && u.email_warnings && !mutes.has(u.id))
          out.push({ user_id: u.id, email: u.email, name: u.name });
      }
      return out;
    },

    async markNotified(changeId, at) {
      const { error } = await db
        .from("competition_changes")
        .update({ notified_at: at.toISOString() })
        .eq("id", changeId);
      if (error) throw error;
    },
  };
}
