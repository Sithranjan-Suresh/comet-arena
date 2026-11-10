import type { EntryResult } from "@/lib/schemas";

export interface StatEntry {
  result: EntryResult;
  rounds_advanced: number;
  verified_by_host: boolean;
}

export interface PlayerStats {
  entered: number;
  /** Got past the first round or reached any placing. */
  advanced: number;
  /** Top three finishes. */
  podiums: number;
  wins: number;
  verified: number;
}

const PODIUM = new Set<EntryResult>(["first", "second", "third"]);

export function computeStats(entries: StatEntry[]): PlayerStats {
  const s: PlayerStats = { entered: entries.length, advanced: 0, podiums: 0, wins: 0, verified: 0 };
  for (const e of entries) {
    if (e.result !== "participated" || e.rounds_advanced > 0) s.advanced++;
    if (PODIUM.has(e.result)) s.podiums++;
    if (e.result === "first") s.wins++;
    if (e.verified_by_host) s.verified++;
  }
  return s;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "7 entered · 3 advanced · 2 podiums · 1 win" (skips zero parts after the first so a new card reads cleanly). */
export function statLine(s: PlayerStats): string {
  const parts = [`${s.entered} entered`];
  if (s.advanced) parts.push(`${s.advanced} advanced`);
  if (s.podiums) parts.push(plural(s.podiums, "podium"));
  if (s.wins) parts.push(plural(s.wins, "win"));
  return parts.join(" · ");
}
