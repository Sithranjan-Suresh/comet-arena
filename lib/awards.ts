import type { StatEntry } from "@/lib/player-stats";

export interface Badge {
  id: string;
  label: string;
  /** Spoken and shown as a tooltip: what earns it. */
  description: string;
}

const BADGES: { badge: Badge; earned: (e: StatEntry[]) => boolean }[] = [
  {
    badge: { id: "first-entry", label: "In the game", description: "Entered a competition" },
    earned: (e) => e.length >= 1,
  },
  {
    badge: { id: "regular", label: "Regular", description: "Entered 5 competitions" },
    earned: (e) => e.length >= 5,
  },
  {
    badge: { id: "advanced", label: "Advancer", description: "Advanced past the first round" },
    earned: (e) => e.some((x) => x.result !== "participated" || x.rounds_advanced > 0),
  },
  {
    badge: { id: "finalist", label: "Finalist", description: "Reached a final" },
    earned: (e) => e.some((x) => ["finalist", "third", "second", "first"].includes(x.result)),
  },
  {
    badge: { id: "podium", label: "Podium finish", description: "Finished in the top three" },
    earned: (e) => e.some((x) => ["third", "second", "first"].includes(x.result)),
  },
  {
    badge: { id: "champion", label: "Champion", description: "Won a competition" },
    earned: (e) => e.some((x) => x.result === "first"),
  },
  {
    badge: { id: "hat-trick", label: "Hat trick", description: "Won three competitions" },
    earned: (e) => e.filter((x) => x.result === "first").length >= 3,
  },
  {
    badge: {
      id: "verified",
      label: "Host verified",
      description: "A host confirmed one of your results",
    },
    earned: (e) => e.some((x) => x.verified_by_host),
  },
];

/** Badges a student has earned, in a fixed order (milestones first). Pure: derived from their entries. */
export function computeBadges(entries: StatEntry[]): Badge[] {
  return BADGES.filter((b) => b.earned(entries)).map((b) => b.badge);
}

export const ALL_BADGES: Badge[] = BADGES.map((b) => b.badge);
