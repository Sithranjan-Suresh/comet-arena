import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { type CompetitionQuery, decodeCursor, encodeCursor } from "@/lib/schemas/competition-query";
import type { CompetitionStatus, GameCardDTO } from "@/lib/schemas";

type CardRow = Database["public"]["Views"]["competition_cards"]["Row"];

/** Escape a user string for use inside a PostgREST `or=(...)` ilike filter. */
export function escapeIlike(s: string): string {
  // Commas and parentheses delimit the or() syntax; % and _ are ilike wildcards; * is PostgREST's wildcard.
  return s
    .replace(/[\\%_*,()"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toGameCard(row: CardRow): GameCardDTO {
  return {
    id: row.id!,
    slug: row.slug!,
    title: row.title!,
    host_name: row.host_name,
    host_slug: row.host_slug,
    categories: (row.categories ?? []) as GameCardDTO["categories"],
    prize: row.prize,
    status: row.status!,
    next_stage: row.next_stage_id
      ? {
          id: row.next_stage_id,
          name: row.next_stage_name ?? "Deadline",
          starts_at: row.next_stage_starts_at,
          deadline_at: row.next_stage_deadline_at!,
          order: row.next_stage_order ?? 0,
        }
      : null,
    viewer_saved: false,
  };
}

const CARD_COLUMNS =
  "id,slug,title,host_name,host_slug,categories,prize,status,has_upcoming,next_stage_id,next_stage_name,next_stage_starts_at,next_stage_deadline_at,next_stage_order";

export interface CompetitionPage {
  items: GameCardDTO[];
  next_cursor: string | null;
}

/**
 * The Field: filter + sort + paginate competition cards (product_spec P1-1). Default order is the next
 * upcoming deadline; competitions with no upcoming deadline (expected, or past when included) follow.
 * Past competitions are hidden unless `include_past`.
 */
export async function queryCompetitions(
  db: SupabaseClient<Database>,
  q: CompetitionQuery,
): Promise<CompetitionPage> {
  const statuses: CompetitionStatus[] = q.include_past
    ? ["live", "unverified", "expected", "past"]
    : ["live", "unverified", "expected"];
  let query = db.from("competition_cards").select(CARD_COLUMNS).in("status", statuses);

  if (q.categories.length) query = query.overlaps("categories", q.categories);
  if (q.format) query = query.eq("format", q.format);
  if (q.cost) query = query.eq("cost", q.cost);
  if (q.utd_only !== undefined) query = query.eq("utd_only", q.utd_only);
  if (q.beginner !== undefined) query = query.eq("beginner_friendly", q.beginner);
  if (q.from) query = query.gte("next_stage_deadline_at", `${q.from}T00:00:00-06:00`);
  if (q.to) query = query.lte("next_stage_deadline_at", `${q.to}T23:59:59-05:00`);

  const host = q.host ? escapeIlike(q.host) : "";
  if (host)
    query = query.or(
      `host_slug.eq.${host.replace(/ /g, "-").toLowerCase()},host_name.ilike.*${host}*`,
    );

  const text = q.q ? escapeIlike(q.q) : "";
  if (text)
    query = query.or(`title.ilike.*${text}*,host_name.ilike.*${text}*,description.ilike.*${text}*`);

  const offset = decodeCursor(q.cursor);
  const { data, error } = await query
    .order("has_upcoming", { ascending: false, nullsFirst: false })
    .order("next_stage_deadline_at", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    // One extra row tells us whether another page exists.
    .range(offset, offset + q.limit);
  if (error) throw error;

  const rows = (data ?? []) as unknown as CardRow[];
  const hasMore = rows.length > q.limit;
  return {
    items: rows.slice(0, q.limit).map(toGameCard),
    next_cursor: hasMore ? encodeCursor(offset + q.limit) : null,
  };
}
