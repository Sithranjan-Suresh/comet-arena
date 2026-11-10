import type { EntryResult } from "@/lib/schemas";

/** Mirror of the SQL function `entry_points` (supabase migration 25), used to explain the formula on the page. */
export const RESULT_POINTS: Record<EntryResult, number> = {
  first: 10,
  second: 7,
  third: 5,
  finalist: 3,
  advanced: 2,
  participated: 1,
};
export const TIER_MULTIPLIER = { campus: 1, regional: 1.5, national: 2 } as const;
export type Tier = keyof typeof TIER_MULTIPLIER;

/** Points for one verified result. A score supplied by the host overrides the formula. */
export function entryPoints(
  result: EntryResult,
  tier: Tier = "campus",
  hostPoints: number | null = null,
): number {
  return hostPoints ?? Math.round(RESULT_POINTS[result] * TIER_MULTIPLIER[tier]);
}
