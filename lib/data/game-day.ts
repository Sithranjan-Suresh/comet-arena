import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Eligibility, GameDayDTO } from "@/lib/schemas";

/** Raw shape returned by the embedded select below (PostgREST nests related rows). */
export interface GameDayRow {
  id: string;
  slug: string;
  title: string;
  host_name: string | null;
  categories: string[];
  description: string | null;
  tier: GameDayDTO["tier"];
  prize: string | null;
  cost: GameDayDTO["cost"];
  format: GameDayDTO["format"];
  location: string | null;
  register_url: string | null;
  utd_only: boolean;
  beginner_friendly: boolean;
  status: GameDayDTO["status"];
  confirmations: number;
  flyer_url: string | null;
  updated_at: string;
  org: { slug: string } | { slug: string }[] | null;
  stages:
    | { id: string; name: string; starts_at: string | null; deadline_at: string; order: number }[]
    | null;
  eligibility: Eligibility | Eligibility[] | null;
  sources:
    | {
        source: GameDayDTO["sources"][number]["source"];
        source_url: string | null;
        seen_at: string;
      }[]
    | null;
}

const GAME_DAY_SELECT = [
  "id,slug,title,host_name,categories,description,tier,prize,cost,format,location,register_url,utd_only",
  "beginner_friendly,status,confirmations,flyer_url,updated_at",
  "org:orgs(slug)",
  "stages(id,name,starts_at,deadline_at,order)",
  "eligibility(majors,class_years,course_prereqs,team_min,team_max,cross_school)",
  "sources:competition_sources(source,source_url,seen_at)",
].join(",");

/** PostgREST returns a single object for to-one relations and an array otherwise; accept both. */
const one = <T>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/** Viewer-independent part of the Game Day DTO. Viewer fields are filled by the caller when signed in. */
export function toGameDay(row: GameDayRow): GameDayDTO {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    host_name: row.host_name,
    host_slug: one(row.org)?.slug ?? null,
    categories: row.categories as GameDayDTO["categories"],
    description: row.description,
    tier: row.tier,
    prize: row.prize,
    cost: row.cost,
    format: row.format,
    location: row.location,
    register_url: row.register_url,
    utd_only: row.utd_only,
    beginner_friendly: row.beginner_friendly,
    status: row.status,
    confirmations: row.confirmations,
    flyer_url: row.flyer_url,
    updated_at: row.updated_at,
    stages: [...(row.stages ?? [])].sort(
      (a, b) => a.order - b.order || a.deadline_at.localeCompare(b.deadline_at),
    ),
    eligibility: one(row.eligibility),
    sources: [...(row.sources ?? [])].sort((a, b) => a.seen_at.localeCompare(b.seen_at)),
    viewer_saved: false,
    viewer_eligible: null,
  };
}

/** One competition by slug with everything the page needs, or null when missing / not visible (RLS). */
export async function getGameDay(
  db: SupabaseClient<Database>,
  slug: string,
): Promise<GameDayDTO | null> {
  const { data, error } = await db
    .from("competitions")
    .select(GAME_DAY_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? toGameDay(data as unknown as GameDayRow) : null;
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
