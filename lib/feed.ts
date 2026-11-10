import { type CourseGraph, expandCourses, normalizeCourse } from "@/lib/courses";
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

export type FeedReason =
  | "closing_soon"
  | "matches_interests"
  | "similar_to_interests"
  | "course_fit"
  | "you_qualify"
  | "open_to_all";
export const REASON_LABEL: Record<FeedReason, string> = {
  closing_soon: "Closing soon",
  matches_interests: "Matches your interests",
  similar_to_interests: "Similar to what you like",
  course_fit: "Fits your coursework",
  you_qualify: "You qualify",
  open_to_all: "Open to everyone",
};

/** Cosine similarity between a student's interests and a competition above which we call it "similar". */
export const SIMILAR_MIN = 0.6;

/** Optional signals from outside services. Either being null/absent just means "no boost from that signal". */
export interface FeedSignals {
  /** Prerequisite graph from Nebula; null when Nebula is down (exact course matching is used instead). */
  courseGraph?: CourseGraph | null;
  /** competition id -> similarity to the student's interests; null when embeddings are unavailable. */
  similarity?: Map<string, number> | null;
}

export interface FeedItem {
  card: GameCardDTO;
  reasons: FeedReason[];
}

/**
 * Scouting Report ranking (product_spec P1-3, v2):
 *  1. keep only competitions the viewer is not known to be ineligible for (their courses count together with
 *     the prerequisites Nebula says those courses imply),
 *  2. bucket by urgency: due within 7 days, then later, then undated,
 *  3. within a bucket, boosted ones first: chosen-interest category (+2), similar to their interests by
 *     embedding (+1), coursework fits a prerequisite (+1); then soonest deadline.
 * Every boost is reported in `reasons`. With no signals (Nebula or embeddings down) it is v1: interests, then
 * deadline. Past competitions are never included. Deterministic: ties break on title, then id.
 */
export function rankFeed(
  all: FeedCompetition[],
  profile: FeedProfile,
  now: Date = new Date(),
  signals: FeedSignals = {},
): FeedItem[] {
  const t = now.getTime();
  const rows: { item: FeedItem; bucket: number; boost: number; deadline: number }[] = [];
  const courses = expandCourses(profile.courses, signals.courseGraph ?? null);
  const haveCourses = new Set(courses);

  for (const { card, eligibility } of all) {
    if (card.status === "past" || card.status === "rejected") continue;
    const stage = card.next_stage;
    const deadline = stage ? new Date(stage.deadline_at).getTime() : Infinity;
    if (stage && deadline < t) continue; // already passed: not for the feed

    const verdict = evaluateEligibility(eligibility, {
      major: profile.major,
      class_year: profile.class_year,
      courses,
    });
    if (verdict === "check") continue; // a known mismatch

    const interest = card.categories.some((c) => profile.interests.includes(c));
    const urgent = deadline - t <= URGENT_DAYS * DAY;
    const reasons: FeedReason[] = [];
    if (urgent && stage) reasons.push("closing_soon");
    if (interest) reasons.push("matches_interests");
    const similar = !interest && (signals.similarity?.get(card.id) ?? 0) >= SIMILAR_MIN;
    if (similar) reasons.push("similar_to_interests");
    const prereqs = eligibility?.course_prereqs ?? [];
    const courseFit =
      prereqs.length > 0 && prereqs.every((c) => haveCourses.has(normalizeCourse(c)));
    if (courseFit) reasons.push("course_fit");
    const restricted =
      !!eligibility &&
      (eligibility.majors.length > 0 ||
        eligibility.class_years.length > 0 ||
        eligibility.course_prereqs.length > 0) &&
      !eligibility.cross_school;
    if (verdict === "qualifies" && restricted) reasons.push("you_qualify");
    else if (!restricted) reasons.push("open_to_all");

    const boost = (interest ? 2 : 0) + (similar ? 1 : 0) + (courseFit ? 1 : 0);
    rows.push({ item: { card, reasons }, bucket: !stage ? 2 : urgent ? 0 : 1, boost, deadline });
  }

  rows.sort(
    (a, b) =>
      a.bucket - b.bucket ||
      b.boost - a.boost ||
      (a.deadline === b.deadline ? 0 : a.deadline < b.deadline ? -1 : 1) ||
      a.item.card.title.localeCompare(b.item.card.title) ||
      a.item.card.id.localeCompare(b.item.card.id),
  );
  return rows.map((r) => r.item);
}
