import { unstable_cache } from "next/cache";
import { z } from "zod";
import { isMockMode } from "@/lib/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export interface PastWinner {
  place: "first" | "second" | "third";
  team_name: string | null;
  /** "Ada L." for students who opted in; null otherwise (shown as "A UTD student"). */
  display: string | null;
  season: string;
}
export interface PrepResource {
  id: string;
  label: string;
  url: string;
}

export const PLACE_LABEL: Record<PastWinner["place"], string> = {
  first: "1st place",
  second: "2nd place",
  third: "3rd place",
};

const CACHE = { revalidate: 300, tags: ["competitions"] };

const winnerSchema = z.object({
  place: z.enum(["first", "second", "third"]),
  team_name: z.string().nullable(),
  display: z.string().nullable(),
  season: z.string(),
});

/** Only http(s) links are ever rendered (the database also enforces it). */
export const safeResourceUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);

export const getPastWinners = unstable_cache(
  async (competitionId: string): Promise<PastWinner[]> => {
    const db = createSupabasePublicClient();
    if (!db) return [];
    const { data, error } = await db.rpc("past_winners", { p_competition_id: competitionId });
    if (error) return [];
    return z
      .array(winnerSchema)
      .catch([])
      .parse(data ?? []);
  },
  ["past-winners"],
  CACHE,
);

export const getPrepResources = unstable_cache(
  async (competitionId: string): Promise<PrepResource[]> => {
    const db = createSupabasePublicClient();
    if (!db) return isMockMode() ? [] : [];
    const { data, error } = await db
      .from("competition_resources")
      .select("id,label,url")
      .eq("competition_id", competitionId)
      .order("created_at");
    if (error) return [];
    return (data ?? []).filter((r) => safeResourceUrl(r.url));
  },
  ["prep-resources"],
  CACHE,
);
