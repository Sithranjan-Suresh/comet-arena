import { evaluateEligibility } from "@/lib/eligibility";
import { type DigestItem, digestEmail } from "@/lib/email/templates";
import type { Eligibility } from "@/lib/schemas";
import type { Mailer } from "@/lib/sources";
import { chicagoWallClock } from "@/lib/tz";
import { realSleep, sendWithRetry } from "./mail";

const DAY = 86_400_000;
export const MAX_PER_SECTION = 8;

export interface DigestCompetition {
  id: string;
  slug: string;
  title: string;
  host_name: string | null;
  categories: string[];
  created_at: string;
  status: "live" | "unverified" | "expected";
  /** Next upcoming stage, if any. */
  next_stage_name: string | null;
  next_deadline_at: string | null;
  eligibility: Pick<
    Eligibility,
    "majors" | "class_years" | "course_prereqs" | "cross_school"
  > | null;
}

export interface DigestUser {
  id: string;
  email: string;
  name: string | null;
  major: string | null;
  class_year: string | null;
  interests: string[];
  courses: string[];
}

export interface DigestDeps {
  loadCompetitions(now: Date): Promise<DigestCompetition[]>;
  /** Users with the weekly digest turned on. */
  loadUsers(): Promise<DigestUser[]>;
  /** competition ids each user saved. */
  loadSaved(userIds: string[]): Promise<Map<string, Set<string>>>;
  /** Confirmed Comet Arena Weekly subscribers without an account. */
  loadSubscribers(): Promise<string[]>;
  mailer: Mailer;
  appUrl: string;
  unsubscribe: {
    userUrl(userId: string): string;
    userHeaders(userId: string): Record<string, string>;
    subscriberUrl(email: string): string;
    subscriberHeaders(email: string): Record<string, string>;
  };
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
  paceMs?: number;
  retryDelaysMs?: number[];
}

export interface DigestResult {
  users: number;
  subscribers: number;
  sent: number;
  skippedEmpty: number;
  failed: number;
  errors: { to: string; message: string }[];
}

/** Monday (Chicago) of the week containing `d`, as YYYY-MM-DD: scopes idempotency keys to one digest per week. */
export function weekKey(d: Date): string {
  const w = chicagoWallClock(d);
  const day = new Date(Date.UTC(w.year, w.month - 1, w.day));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

const toItem = (c: DigestCompetition, saved: boolean): DigestItem => ({
  title: c.title,
  slug: c.slug,
  host: c.host_name,
  stageName: c.next_stage_name,
  deadlineAt: c.next_deadline_at,
  saved,
});

const byDeadline = (a: DigestCompetition, b: DigestCompetition) =>
  (a.next_deadline_at ?? "").localeCompare(b.next_deadline_at ?? "") ||
  a.title.localeCompare(b.title);

function closingThisWeek(all: DigestCompetition[], now: Date): DigestCompetition[] {
  const end = now.getTime() + 7 * DAY;
  return all
    .filter(
      (c) =>
        c.next_deadline_at &&
        new Date(c.next_deadline_at).getTime() >= now.getTime() &&
        new Date(c.next_deadline_at).getTime() <= end,
    )
    .sort(byDeadline);
}

function newThisWeek(all: DigestCompetition[], now: Date): DigestCompetition[] {
  const since = now.getTime() - 7 * DAY;
  return all.filter(
    (c) =>
      new Date(c.created_at).getTime() >= since && (c.next_deadline_at || c.status === "expected"),
  );
}

/** Profile relevance: +2 per matching interest category, +1 when they qualify. Newest first among ties. */
export function relevance(c: DigestCompetition, user: DigestUser): number {
  const interest = c.categories.filter((cat) => user.interests.includes(cat)).length * 2;
  const verdict = evaluateEligibility(c.eligibility, {
    major: user.major,
    class_year: user.class_year,
    courses: user.courses,
  });
  return interest + (verdict === "qualifies" ? 1 : 0);
}

/** Personalized digest content for an account holder (saved first; new items ranked and filtered by eligibility). */
export function digestForUser(
  all: DigestCompetition[],
  user: DigestUser,
  saved: Set<string>,
  now: Date,
) {
  const closing = closingThisWeek(all, now);
  const closingSorted = [
    ...closing.filter((c) => saved.has(c.id)),
    ...closing.filter((c) => !saved.has(c.id)),
  ].slice(0, MAX_PER_SECTION);
  const shown = new Set(closingSorted.map((c) => c.id));

  const fresh = newThisWeek(all, now)
    .filter((c) => !shown.has(c.id))
    // "Check eligibility" means a known mismatch: keep the digest about things they can enter.
    .filter(
      (c) =>
        evaluateEligibility(c.eligibility, {
          major: user.major,
          class_year: user.class_year,
          courses: user.courses,
        }) !== "check",
    )
    .sort(
      (a, b) => relevance(b, user) - relevance(a, user) || b.created_at.localeCompare(a.created_at),
    )
    .slice(0, MAX_PER_SECTION);

  return {
    closingThisWeek: closingSorted.map((c) => toItem(c, saved.has(c.id))),
    newThisWeek: fresh.map((c) => toItem(c, saved.has(c.id))),
  };
}

/** Unranked digest for subscribers without an account. */
export function digestForSubscriber(all: DigestCompetition[], now: Date) {
  const closing = closingThisWeek(all, now).slice(0, MAX_PER_SECTION);
  const shown = new Set(closing.map((c) => c.id));
  const fresh = newThisWeek(all, now)
    .filter((c) => !shown.has(c.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_PER_SECTION);
  return {
    closingThisWeek: closing.map((c) => toItem(c, false)),
    newThisWeek: fresh.map((c) => toItem(c, false)),
  };
}

/** Sunday 6 PM CT: Comet Arena Weekly to account holders (ranked) and email subscribers (unranked). */
export async function runSendDigest(deps: DigestDeps): Promise<DigestResult> {
  const now = deps.now ?? new Date();
  const sleep = deps.sleep ?? realSleep;
  const delays = deps.retryDelaysMs ?? [1000, 4000, 15000];
  const paceMs = deps.paceMs ?? 550;
  const week = weekKey(now);
  const result: DigestResult = {
    users: 0,
    subscribers: 0,
    sent: 0,
    skippedEmpty: 0,
    failed: 0,
    errors: [],
  };

  const [competitions, users, subscribers] = await Promise.all([
    deps.loadCompetitions(now),
    deps.loadUsers(),
    deps.loadSubscribers(),
  ]);
  const savedByUser = users.length
    ? await deps.loadSaved(users.map((u) => u.id))
    : new Map<string, Set<string>>();
  result.users = users.length;
  result.subscribers = subscribers.length;
  let first = true;

  async function deliver(
    to: string,
    key: string,
    email: ReturnType<typeof digestEmail>,
    headers: Record<string, string>,
  ) {
    if (!first && paceMs > 0) await sleep(paceMs);
    first = false;
    try {
      await sendWithRetry(
        deps.mailer,
        {
          to,
          subject: email.subject,
          html: email.html,
          text: email.text,
          idempotencyKey: key,
          headers,
        },
        delays,
        sleep,
      );
      result.sent++;
    } catch (e) {
      result.failed++;
      result.errors.push({ to, message: e instanceof Error ? e.message : String(e) });
    }
  }

  for (const u of users) {
    const content = digestForUser(competitions, u, savedByUser.get(u.id) ?? new Set(), now);
    if (content.closingThisWeek.length === 0 && content.newThisWeek.length === 0) {
      result.skippedEmpty++;
      continue;
    }
    const email = digestEmail({
      userName: u.name,
      ...content,
      appUrl: deps.appUrl,
      unsubscribeUrl: deps.unsubscribe.userUrl(u.id),
      personalized: true,
    });
    await deliver(u.email, `digest:${u.id}:${week}`, email, deps.unsubscribe.userHeaders(u.id));
  }

  const generic = digestForSubscriber(competitions, now);
  for (const raw of subscribers) {
    const to = raw.toLowerCase();
    if (generic.closingThisWeek.length === 0 && generic.newThisWeek.length === 0) {
      result.skippedEmpty++;
      continue;
    }
    const email = digestEmail({
      userName: null,
      ...generic,
      appUrl: deps.appUrl,
      unsubscribeUrl: deps.unsubscribe.subscriberUrl(to),
      personalized: false,
    });
    await deliver(to, `digest:sub:${to}:${week}`, email, deps.unsubscribe.subscriberHeaders(to));
  }
  return result;
}
