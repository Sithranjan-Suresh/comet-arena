import type { SupabaseClient } from "@supabase/supabase-js";
import { registrationClosed } from "@/lib/free-agency";
import type { Database } from "@/lib/supabase/database.types";

export interface MyPost {
  kind: "agent" | "opening";
  id: string;
  title: string;
  slug: string;
  roles: string[];
  note: string;
  status: "open" | "closed";
  teamName?: string;
}

export interface SavedBoard {
  competition_id: string;
  slug: string;
  title: string;
  agents: number;
  openings: number;
  registrationClosed: boolean;
}

export interface Hub {
  myPosts: MyPost[];
  boards: SavedBoard[];
}

type Rel<T> = T | T[] | null;
const one = <T>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
type CompRel = { slug: string; title: string };

interface AgentRow {
  id: string;
  roles: string[];
  note: string;
  status: "open" | "closed";
  competition: Rel<CompRel>;
}
interface OpeningRow {
  id: string;
  team_name: string;
  roles_needed: string[];
  note: string;
  status: "open" | "closed";
  competition: Rel<CompRel>;
}
interface SaveRow {
  competition: Rel<{
    id: string;
    slug: string;
    title: string;
    status: string;
    stages: { order: number; deadline_at: string }[] | null;
  }>;
}

/** Pure: shape raw rows into what the page shows. Open posts first; boards with activity first. */
export function summarizeHub(
  agents: AgentRow[],
  openings: OpeningRow[],
  saves: SaveRow[],
  agentCounts: Map<string, number>,
  openingCounts: Map<string, number>,
  now: Date = new Date(),
): Hub {
  const myPosts: MyPost[] = [];
  for (const a of agents) {
    const c = one(a.competition);
    if (c)
      myPosts.push({
        kind: "agent",
        id: a.id,
        title: c.title,
        slug: c.slug,
        roles: a.roles,
        note: a.note,
        status: a.status,
      });
  }
  for (const o of openings) {
    const c = one(o.competition);
    if (c)
      myPosts.push({
        kind: "opening",
        id: o.id,
        title: c.title,
        slug: c.slug,
        roles: o.roles_needed,
        note: o.note,
        status: o.status,
        teamName: o.team_name,
      });
  }
  myPosts.sort(
    (a, b) =>
      Number(b.status === "open") - Number(a.status === "open") || a.title.localeCompare(b.title),
  );

  const boards: SavedBoard[] = [];
  for (const s of saves) {
    const c = one(s.competition);
    if (!c || c.status === "rejected") continue;
    boards.push({
      competition_id: c.id,
      slug: c.slug,
      title: c.title,
      agents: agentCounts.get(c.id) ?? 0,
      openings: openingCounts.get(c.id) ?? 0,
      registrationClosed: c.status === "past" || registrationClosed(c.stages ?? [], now),
    });
  }
  boards.sort(
    (a, b) => b.agents + b.openings - (a.agents + a.openings) || a.title.localeCompare(b.title),
  );
  return { myPosts, boards };
}

const countBy = (rows: { competition_id: string }[] | null) => {
  const m = new Map<string, number>();
  for (const r of rows ?? []) m.set(r.competition_id, (m.get(r.competition_id) ?? 0) + 1);
  return m;
};

/** The signed-in student's Free Agency hub. `supabase` is their RLS-bound client. */
export async function getHub(
  supabase: SupabaseClient<Database>,
  userId: string,
  now: Date = new Date(),
): Promise<Hub> {
  const [agents, openings, saves] = await Promise.all([
    supabase
      .from("free_agents")
      .select("id,roles,note,status,competition:competitions(slug,title)")
      .eq("user_id", userId),
    supabase
      .from("team_openings")
      .select("id,team_name,roles_needed,note,status,competition:competitions(slug,title)")
      .eq("user_id", userId),
    supabase
      .from("saves")
      .select("competition:competitions(id,slug,title,status,stages(order,deadline_at))")
      .eq("user_id", userId)
      .limit(50),
  ]);
  for (const r of [agents, openings, saves]) if (r.error) throw r.error;

  const saveRows = (saves.data ?? []) as unknown as SaveRow[];
  const ids = saveRows.map((s) => one(s.competition)?.id).filter((x): x is string => !!x);
  let agentCounts = new Map<string, number>();
  let openingCounts = new Map<string, number>();
  if (ids.length) {
    const [a, o] = await Promise.all([
      supabase.from("board_free_agents").select("competition_id").in("competition_id", ids),
      supabase.from("board_team_openings").select("competition_id").in("competition_id", ids),
    ]);
    agentCounts = countBy(a.data as { competition_id: string }[] | null);
    openingCounts = countBy(o.data as { competition_id: string }[] | null);
  }
  return summarizeHub(
    (agents.data ?? []) as unknown as AgentRow[],
    (openings.data ?? []) as unknown as OpeningRow[],
    saveRows,
    agentCounts,
    openingCounts,
    now,
  );
}
