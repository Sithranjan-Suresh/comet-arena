import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { type Schedule, type ScheduleStage, buildSchedule } from "@/lib/schedule";

interface SaveRow {
  competition: {
    id: string;
    slug: string;
    title: string;
    status: string;
    register_url: string | null;
    stages: { id: string; name: string; starts_at: string | null; deadline_at: string }[] | null;
  } | null;
}

/** Flatten saves -> competitions -> stages. Rejected competitions never appear. */
export function flattenSaves(rows: SaveRow[]): ScheduleStage[] {
  const out: ScheduleStage[] = [];
  for (const r of rows) {
    const c = r.competition;
    if (!c || c.status === "rejected") continue;
    for (const s of c.stages ?? []) {
      out.push({
        stage_id: s.id,
        stage_name: s.name,
        starts_at: s.starts_at,
        deadline_at: s.deadline_at,
        competition_id: c.id,
        slug: c.slug,
        title: c.title,
        register_url: c.register_url,
      });
    }
  }
  return out;
}

/** The user's schedule. `supabase` must be the user's RLS-bound client (own saves only). */
export async function getSchedule(
  supabase: SupabaseClient<Database>,
  userId: string,
  now: Date = new Date(),
): Promise<Schedule> {
  const { data, error } = await supabase
    .from("saves")
    .select(
      "competition:competitions(id,slug,title,status,register_url,stages(id,name,starts_at,deadline_at))",
    )
    .eq("user_id", userId);
  if (error) throw error;
  return buildSchedule(flattenSaves((data ?? []) as unknown as SaveRow[]), now);
}
