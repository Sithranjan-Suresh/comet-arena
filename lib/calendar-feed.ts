import { type IcsStage, buildIcs } from "@/lib/ics";
import { ICS_TOKEN_PATTERN } from "@/lib/ics-url";

/** Feed covers stages from this many days ago onward, so the file stays small. */
export const FEED_LOOKBACK_DAYS = 30;

export interface FeedDeps {
  /** Resolve a secret token to a user id (null when unknown). */
  findUserIdByToken(token: string): Promise<string | null>;
  /** All stages of the user's saved competitions. */
  fetchStages(userId: string): Promise<IcsStage[]>;
  appUrl: string;
  now?: Date;
}

export type FeedResult = { status: 200; body: string } | { status: 404 } | { status: 503 };

/** The route segment looks like "<48 hex>.ics". Returns the token or null. */
export function tokenFromSegment(segment: string): string | null {
  if (!segment.endsWith(".ics")) return null;
  const token = segment.slice(0, -4);
  return ICS_TOKEN_PATTERN.test(token) ? token : null;
}

/**
 * Build a user's calendar feed from a secret token. Unknown, malformed and revoked tokens all return
 * the same 404 so the endpoint cannot be used to probe which tokens exist.
 */
export async function buildUserFeed(segment: string, deps: FeedDeps): Promise<FeedResult> {
  const token = tokenFromSegment(segment);
  if (!token) return { status: 404 };
  try {
    const userId = await deps.findUserIdByToken(token);
    if (!userId) return { status: 404 };
    const now = deps.now ?? new Date();
    const cutoff = now.getTime() - FEED_LOOKBACK_DAYS * 86_400_000;
    const stages = (await deps.fetchStages(userId)).filter(
      (s) => new Date(s.deadline_at).getTime() >= cutoff,
    );
    return { status: 200, body: buildIcs({ stages, appUrl: deps.appUrl, now }) };
  } catch {
    return { status: 503 };
  }
}
