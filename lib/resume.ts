import { RESULT_ORDER, RESULT_SHORT } from "@/lib/entries-client";
import type { EntryResult } from "@/lib/schemas";

export interface ResumeEntry {
  title: string;
  result: EntryResult;
  season: string;
  team_name: string;
  verified_by_host: boolean;
}

const SEASON_RANK: Record<string, number> = { Spring: 1, Summer: 2, Fall: 3 };
/** Sort key: later seasons first ("Fall 2026" before "Spring 2026" before "Fall 2025"). */
function seasonKey(season: string): number {
  const [name, year] = season.split(" ");
  return Number(year) * 10 + (SEASON_RANK[name] ?? 0);
}

/**
 * Résumé-ready lines: "AIS Fall Case Competition — 2nd place (Fall 2026), Comet Coders".
 * Strongest result first, then most recent. Unverified entries carry a `*` and a footnote, so a résumé
 * never presents a self-reported result as host-confirmed.
 */
export function formatResumeList(
  entries: ResumeEntry[],
  opts: { footnote?: boolean } = {},
): string {
  const sorted = [...entries].sort(
    (a, b) =>
      RESULT_ORDER.indexOf(b.result) - RESULT_ORDER.indexOf(a.result) ||
      seasonKey(b.season) - seasonKey(a.season) ||
      a.title.localeCompare(b.title),
  );
  const lines = sorted.map((e) => {
    const team = e.team_name.trim() ? `, ${e.team_name.trim()}` : "";
    return `• ${e.title} — ${RESULT_SHORT[e.result]} (${e.season})${team}${e.verified_by_host ? "" : " *"}`;
  });
  if ((opts.footnote ?? true) && sorted.some((e) => !e.verified_by_host))
    lines.push("", "* Self-reported");
  return lines.join("\n");
}
