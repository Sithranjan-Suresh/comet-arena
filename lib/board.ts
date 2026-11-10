import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/schemas";
import type { Database } from "@/lib/supabase/database.types";

export interface BoardFreeAgent {
  id: string;
  roles: string[];
  note: string;
  created_at: string;
  display_name: string;
  /** Present only for signed-in viewers; the database view nulls it for everyone else. */
  contact_email: string | null;
  is_mine: boolean;
}
export interface BoardOpening {
  id: string;
  team_name: string;
  roles_needed: string[];
  note: string;
  created_at: string;
  display_name: string;
  contact_email: string | null;
  is_mine: boolean;
}
export interface Board {
  free_agents: BoardFreeAgent[];
  openings: BoardOpening[];
}

export const BOARD_LIMIT = 100;

/**
 * Free agents and team openings for one competition, optionally filtered by role.
 * `supabase` is the request's client: when a user is signed in the board views include contact emails,
 * otherwise they return NULL (enforced in SQL, see migration 008).
 */
export async function getBoard(
  supabase: SupabaseClient<Database>,
  slug: string,
  role?: Role,
): Promise<Board | null> {
  const { data: comp, error } = await supabase
    .from("competitions")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !comp) return null;

  let agents = supabase
    .from("board_free_agents")
    .select("id,roles,note,created_at,display_name,contact_email,is_mine")
    .eq("competition_id", comp.id);
  let openings = supabase
    .from("board_team_openings")
    .select("id,team_name,roles_needed,note,created_at,display_name,contact_email,is_mine")
    .eq("competition_id", comp.id);
  if (role) {
    agents = agents.contains("roles", [role]);
    openings = openings.contains("roles_needed", [role]);
  }

  const [a, o] = await Promise.all([
    agents.order("created_at", { ascending: false }).limit(BOARD_LIMIT),
    openings.order("created_at", { ascending: false }).limit(BOARD_LIMIT),
  ]);
  if (a.error || o.error) throw a.error ?? o.error;
  return {
    free_agents: (a.data ?? []) as unknown as BoardFreeAgent[],
    openings: (o.data ?? []) as unknown as BoardOpening[],
  };
}
