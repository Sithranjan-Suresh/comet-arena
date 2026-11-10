import { unstable_cache } from "next/cache";
import { isMockMode } from "@/lib/env";
import { type CompetitionPage, queryCompetitions } from "@/lib/data/competitions";
import { getFixtureGameDay, queryFixtureCompetitions } from "@/lib/data/fixture-data";
import { getGameDay } from "@/lib/data/game-day";
import type { GameDayDTO } from "@/lib/schemas";
import type { CompetitionQuery } from "@/lib/schemas/competition-query";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * Public data entry points for pages. Reads go through Next's data cache (5 minutes, tag
 * "competitions") so The Field and Game Day stay fast and never hit third-party APIs.
 * Without Supabase configured, mock mode serves fixtures; live mode fails loudly.
 */

const CACHE = { revalidate: 300, tags: ["competitions"] };

export const getCompetitionsPage = unstable_cache(
  async (q: CompetitionQuery): Promise<CompetitionPage> => {
    const db = createSupabasePublicClient();
    if (db) return queryCompetitions(db, q);
    if (isMockMode()) return queryFixtureCompetitions(q);
    throw new Error("Supabase is not configured");
  },
  ["competitions-page"],
  CACHE,
);

export const getGameDayBySlug = unstable_cache(
  async (slug: string): Promise<GameDayDTO | null> => {
    const db = createSupabasePublicClient();
    if (db) return getGameDay(db, slug);
    if (isMockMode()) return getFixtureGameDay(slug);
    throw new Error("Supabase is not configured");
  },
  ["game-day"],
  CACHE,
);
