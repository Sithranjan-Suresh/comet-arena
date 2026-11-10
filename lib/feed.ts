import { evaluateEligibility } from "@/lib/eligibility";
import type { GameCardDTO, Eligibility } from "@/lib/schemas";

const DAY = 86_400_000;
/** Deadlines inside this window always rank above everything else: urgency beats interest. */
export const URGENT_DAYS = 7;

export interface FeedCompetition {
  card: GameCardDTO;
  eligibility: Pick<
    Eligibility,
    "majors" | "class_years" | "course_prereqs" | "cross_school"
  > | null;
}

export interface FeedProfile {
  major: string | null;
  class_year: string | null;
  interests: string[];
  courses: string[];
}

export type FeedReason = "closing_soon" | "matches_interests" | "you_qualify" | "open_to_all";
export const REASON_LABEL: Record<FeedReason, string> = {
  closing_soon: "Closing soon",
  matches_interests: "Matches your interests",
  you_qualify: "You qualify",
  open_to_all: "Open to everyone",
};

export interface FeedItem {
  card: GameCardDTO;
  reasons: FeedReason[];
}

/**
 * Scouting Report ranking (product_spec P1-3, v1):
 *  1. keep only competitions the viewer is not known to be ineligible for,
 *  2. bucket by urgency: due within 7 days, then later, then undated,
 *  3. within a bucket, chosen-interest categories first, then soonest deadline.
 * Past competitions are never included. Deterministic: ties break on title, then id.
 */
export function rankFeed(
  all: FeedCompetition[],
  profile: FeedProfile,
  now: Date = new Date(),
): FeedItem[] {
  const t = now.getTime();
  const rows: { item: FeedItem; bucket: number; interest: boolean; deadline: number }[] = [];

  for (const { card, eligibility } of all) {
    if (card.status === "past" || card.status === "rejected") continue;
    const stage = card.next_stage;
    const deadline = stage ? new Date(stage.deadline_at).getTime() : Infinity;
    if (stage && deadline < t) continue; // already passed: not for the feed

    const verdict = evaluateEligibility(eligibility, {
      major: profile.major,
      class_year: profile.class_year,
      courses: profile.courses,
    });
    if (verdict === "check") continue; // a known mismatch

    const interest = card.categories.some((c) => profile.interests.includes(c));
    const urgent = deadline - t <= URGENT_DAYS * DAY;
    const reasons: FeedReason[] = [];
    if (urgent && stage) reasons.push("closing_soon");
    if (interest) reasons.push("matches_interests");
    const restricted =
      !!eligibility &&
      (eligibility.majors.length > 0 ||
        eligibility.class_years.length > 0 ||
        eligibility.course_prereqs.length > 0) &&
      !eligibility.cross_school;
    if (verdict === "qualifies" && restricted) reasons.push("you_qualify");
    else if (!restricted) reasons.push("open_to_all");

    rows.push({ item: { card, reasons }, bucket: !stage ? 2 : urgent ? 0 : 1, interest, deadline });
  }

  rows.sort(
    (a, b) =>
      a.bucket - b.bucket ||
      Number(b.interest) - Number(a.interest) ||
      (a.deadline === b.deadline ? 0 : a.deadline < b.deadline ? -1 : 1) ||
      a.item.card.title.localeCompare(b.item.card.title) ||
      a.item.card.id.localeCompare(b.item.card.id),
  );
  return rows.map((r) => r.item);
}
