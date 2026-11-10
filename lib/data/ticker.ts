import { unstable_cache } from "next/cache";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export interface TickerItem {
  slug: string;
  title: string;
  stage: string;
  deadline: string;
}

interface CardRow {
  slug: string | null;
  title: string | null;
  next_stage_name: string | null;
  next_stage_deadline_at: string | null;
  has_upcoming: boolean | null;
}

/** Keep upcoming rows only, soonest first, capped. Pure so it can be tested. */
export function toTickerItems(rows: CardRow[], now: Date = new Date(), limit = 10): TickerItem[] {
  return rows
    .filter(
      (r): r is CardRow & { slug: string; title: string; next_stage_deadline_at: string } =>
        !!r.slug && !!r.title && !!r.next_stage_deadline_at && r.has_upcoming !== false,
    )
    .filter((r) => new Date(r.next_stage_deadline_at).getTime() > now.getTime())
    .sort((a, b) => a.next_stage_deadline_at.localeCompare(b.next_stage_deadline_at))
    .slice(0, limit)
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      stage: r.next_stage_name ?? "Deadline",
      deadline: r.next_stage_deadline_at,
    }));
}

async function fetchTicker(): Promise<TickerItem[]> {
  const db = createSupabasePublicClient();
  if (!db) return [];
  const { data, error } = await db
    .from("competition_cards")
    .select("slug,title,next_stage_name,next_stage_deadline_at,has_upcoming")
    .in("status", ["live", "unverified"])
    .eq("has_upcoming", true)
    .order("next_stage_deadline_at", { ascending: true })
    .limit(20);
  if (error || !data) return [];
  return toTickerItems(data);
}

/** Cached 5 minutes. Never throws: the shell must render even if the database is down. */
export const getTickerItems = unstable_cache(
  async () => {
    try {
      return await fetchTicker();
    } catch {
      return [];
    }
  },
  ["ticker-items"],
  { revalidate: 300, tags: ["competitions"] },
);
