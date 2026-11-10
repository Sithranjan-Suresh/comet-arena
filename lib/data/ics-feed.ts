import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { IcsStage } from "@/lib/ics";

interface Row {
  competition: {
    id: string;
    slug: string;
    title: string;
    status: string;
    register_url: string | null;
    updated_at: string;
    stages: { id: string; name: string; starts_at: string | null; deadline_at: string }[] | null;
  } | null;
}

export function toIcsStages(rows: Row[]): IcsStage[] {
  const out: IcsStage[] = [];
  for (const r of rows) {
    const c = r.competition;
    if (!c || c.status === "rejected") continue;
    for (const s of c.stages ?? []) {
      out.push({
        stage_id: s.id,
        stage_name: s.name,
        starts_at: s.starts_at,
        deadline_at: s.deadline_at,
        title: c.title,
        slug: c.slug,
        register_url: c.register_url,
        updated_at: c.updated_at,
      });
    }
  }
  return out;
}

/** Service-role queries for the token-authenticated feed (no user session exists on this route). */
export function supabaseFeedDeps(db: SupabaseClient<Database>) {
  return {
    async findUserIdByToken(token: string) {
      const { data, error } = await db
        .from("users")
        .select("id")
        .eq("ics_token", token)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    async fetchStages(userId: string) {
      const { data, error } = await db
        .from("saves")
        .select(
          "competition:competitions(id,slug,title,status,register_url,updated_at,stages(id,name,starts_at,deadline_at))",
        )
        .eq("user_id", userId);
      if (error) throw error;
      return toIcsStages((data ?? []) as unknown as Row[]);
    },
  };
}
