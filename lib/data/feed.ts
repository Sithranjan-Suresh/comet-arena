import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseGraph } from "@/lib/courses";
import type { FeedCompetition, FeedItem, FeedProfile, FeedSignals } from "@/lib/feed";
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

/** Outside services that sharpen the ranking. Each is optional and each failure only drops that boost. */
export interface FeedEnrichment {
  /** Prerequisite graph for the student's courses (Nebula), or null. */
  courseGraph?: () => Promise<CourseGraph | null>;
  /** Embeds the student's interests. */
  embed?: (text: string) => Promise<number[]>;
}

/** Text describing what the student likes, embedded to find similar competitions. */
export function interestText(profile: FeedProfile): string | null {
  const parts = [...profile.interests.map((i) => i.replace(/_/g, " "))];
  if (parts.length === 0) return null;
  return `${parts.join(", ")}${profile.major ? ` | ${profile.major}` : ""}`;
}

/** Ranked page of the Scouting Report for one student. */
export async function getFeed(
  supabase: SupabaseClient<Database>,
  profile: FeedProfile,
  opts: { cursor?: string; now?: Date; enrich?: FeedEnrichment } = {},
): Promise<{ items: FeedItem[]; next_cursor: string | null }> {
  const now = opts.now ?? new Date();
  const { data, error } = await supabase
    .from("competitions")
    .select(
      "id,slug,title,host_name,categories,prize,status,org:orgs(slug),stages(id,name,starts_at,deadline_at,order),eligibility(majors,class_years,course_prereqs,cross_school)",
    )
    .in("status", ["live", "unverified", "expected"]);
  if (error) throw error;

  const all = ((data ?? []) as unknown as Row[]).map((r) => toFeedCompetition(r, now));

  // Both signals are best effort: Nebula or the embedding service being down never breaks the feed.
  const signals: FeedSignals = {};
  const needsCourses = profile.courses.length > 0 && opts.enrich?.courseGraph;
  const text = interestText(profile);
  const [graph, similarity] = await Promise.all([
    needsCourses ? opts.enrich!.courseGraph!().catch(() => null) : Promise.resolve(null),
    text && opts.enrich?.embed
      ? (async () => {
          try {
            const embedding = await opts.enrich!.embed!(text);
            const { data: rows, error: e2 } = await supabase.rpc("similarity_to", {
              p_embedding: `[${embedding.join(",")}]`,
              p_ids: all.map((c) => c.card.id),
            });
            if (e2) return null;
            return new Map(
              ((rows ?? []) as unknown as { id: string; similarity: number }[]).map((r) => [
                r.id,
                Number(r.similarity),
              ]),
            );
          } catch {
            return null;
          }
        })()
      : Promise.resolve(null),
  ]);
  signals.courseGraph = graph;
  signals.similarity = similarity;

  const ranked = rankFeed(all, profile, now, signals);
  const offset = decodeCursor(opts.cursor);
  return {
    items: ranked.slice(offset, offset + FEED_PAGE),
    next_cursor: ranked.length > offset + FEED_PAGE ? encodeCursor(offset + FEED_PAGE) : null,
  };
}
