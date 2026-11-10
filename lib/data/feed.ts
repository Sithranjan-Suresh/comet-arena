import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedCompetition, FeedItem, FeedProfile } from "@/lib/feed";
import { rankFeed } from "@/lib/feed";
import type { GameCardDTO } from "@/lib/schemas";
import { decodeCursor, encodeCursor } from "@/lib/schemas/competition-query";
import type { Database } from "@/lib/supabase/database.types";

interface Row {
  id: string;
  slug: string;
  title: string;
  host_name: string | null;
  categories: string[];
  prize: string | null;
  status: GameCardDTO["status"];
  org: { slug: string } | { slug: string }[] | null;
  stages:
    | { id: string; name: string; starts_at: string | null; deadline_at: string; order: number }[]
    | null;
  eligibility:
    | NonNullable<FeedCompetition["eligibility"]>
    | NonNullable<FeedCompetition["eligibility"]>[]
    | null;
}

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export function toFeedCompetition(r: Row, now: Date): FeedCompetition {
  const upcoming = [...(r.stages ?? [])]
    .filter((s) => new Date(s.deadline_at).getTime() >= now.getTime())
    .sort((a, b) => a.deadline_at.localeCompare(b.deadline_at));
  const next = upcoming[0] ?? null;
  return {
    card: {
      id: r.id,
      slug: r.slug,
      title: r.title,
      host_name: r.host_name,
      host_slug: one(r.org)?.slug ?? null,
      categories: r.categories as GameCardDTO["categories"],
      prize: r.prize,
      status: r.status,
      next_stage: next
        ? {
            id: next.id,
            name: next.name,
            starts_at: next.starts_at,
            deadline_at: next.deadline_at,
            order: next.order,
          }
        : null,
      viewer_saved: false,
    },
    eligibility: one(r.eligibility),
  };
}

export const FEED_PAGE = 20;

/** Ranked page of the Scouting Report for one student. */
export async function getFeed(
  supabase: SupabaseClient<Database>,
  profile: FeedProfile,
  opts: { cursor?: string; now?: Date } = {},
): Promise<{ items: FeedItem[]; next_cursor: string | null }> {
  const now = opts.now ?? new Date();
  const { data, error } = await supabase
    .from("competitions")
    .select(
      "id,slug,title,host_name,categories,prize,status,org:orgs(slug),stages(id,name,starts_at,deadline_at,order),eligibility(majors,class_years,course_prereqs,cross_school)",
    )
    .in("status", ["live", "unverified", "expected"]);
  if (error) throw error;

  const ranked = rankFeed(
    ((data ?? []) as unknown as Row[]).map((r) => toFeedCompetition(r, now)),
    profile,
    now,
  );
  const offset = decodeCursor(opts.cursor);
  return {
    items: ranked.slice(offset, offset + FEED_PAGE),
    next_cursor: ranked.length > offset + FEED_PAGE ? encodeCursor(offset + FEED_PAGE) : null,
  };
}
