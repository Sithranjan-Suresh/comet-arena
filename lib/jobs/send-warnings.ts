import { warningEmail } from "@/lib/email/templates";
import type { Mailer } from "@/lib/sources";
import { SourceError } from "@/lib/sources";
import type { WarningWindow } from "@/lib/schemas";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Nominal lead time of each warning. */
export const WINDOW_MS: Record<WarningWindow, number> = { d7: 7 * DAY, d1: 1 * DAY };
/** Spec: stages with a deadline in [now + lead ± 30 min]. */
export const WINDOW_HALF_MS = 30 * MIN;
/**
 * If a send failed, the next hourly runs can still deliver it up to this much later (the warning then
 * says a little under "7 days" but never misses). Hourly windows alone would tile and lose failures.
 */
export const CATCH_UP_MS = 3 * 60 * MIN;
/** A save made after (deadline - lead + this slack) never gets that window's warning. */
const SAVE_SLACK_MS = 30 * MIN;

export interface Candidate {
  stage_id: string;
  stage_name: string;
  deadline_at: string;
  competition_id: string;
  title: string;
  slug: string;
  register_url: string | null;
  user_id: string;
  email: string;
  user_name: string | null;
  saved_at: string;
}

export interface WarningsDeps {
  /** Stages due in [from, to] for savers with warnings on (SQL: stages_due_between). */
  findCandidates(from: Date, to: Date): Promise<Candidate[]>;
  /** Which (user, stage, window) triples were already sent. */
  alreadySent(
    window: WarningWindow,
    keys: { user_id: string; stage_id: string }[],
  ): Promise<Set<string>>;
  recordSent(row: { user_id: string; stage_id: string; window: WarningWindow }): Promise<void>;
  mailer: Mailer;
  appUrl: string;
  /** Builds signed unsubscribe URLs and RFC 8058 headers (injected so tests do not need secrets). */
  unsubscribe: {
    competitionUrl(userId: string, competitionId: string): string;
    allUrl(userId: string): string;
    headers(userId: string): Record<string, string>;
  };
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
  /** Pause between sends to respect the provider's rate limit. */
  paceMs?: number;
  /** Backoff schedule for retryable failures. */
  retryDelaysMs?: number[];
}

export interface WarningsResult {
  considered: number;
  sent: number;
  skippedAlreadySent: number;
  skippedSavedLate: number;
  failed: number;
  errors: { user_id: string; stage_id: string; window: WarningWindow; message: string }[];
}

export const sentKey = (userId: string, stageId: string) => `${userId}:${stageId}`;
export const idempotencyKey = (userId: string, stageId: string, window: WarningWindow) =>
  `warn:${userId}:${stageId}:${window}`;

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retry rate limits and outages with backoff; everything else (bad address, rejected content) is permanent. */
async function sendWithRetry(
  mailer: Mailer,
  msg: Parameters<Mailer["send"]>[0],
  delays: number[],
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await mailer.send(msg);
      return;
    } catch (e) {
      const retryable =
        e instanceof SourceError &&
        (e.kind === "rate_limit" || e.kind === "unavailable" || e.kind === "timeout");
      if (!retryable || attempt >= delays.length) throw e;
      await sleep(
        e instanceof SourceError && e.retryAfterMs
          ? Math.max(e.retryAfterMs, delays[attempt])
          : delays[attempt],
      );
    }
  }
}

/**
 * Two-Minute Warning: email savers 7 days and 1 day before each stage deadline (CL-5).
 * Exactly once per (user, stage, window): the `warnings_sent` ledger skips repeats, and the email
 * idempotency key makes a crashed-then-retried run safe even before the ledger row is written.
 */
export async function runSendWarnings(deps: WarningsDeps): Promise<WarningsResult> {
  const now = deps.now ?? new Date();
  const sleep = deps.sleep ?? realSleep;
  const delays = deps.retryDelaysMs ?? [1000, 4000, 15000];
  const paceMs = deps.paceMs ?? 550;
  const result: WarningsResult = {
    considered: 0,
    sent: 0,
    skippedAlreadySent: 0,
    skippedSavedLate: 0,
    failed: 0,
    errors: [],
  };
  const base = deps.appUrl.replace(/\/+$/, "");
  let first = true;

  for (const window of ["d7", "d1"] as const) {
    const lead = WINDOW_MS[window];
    const from = new Date(now.getTime() + lead - CATCH_UP_MS - WINDOW_HALF_MS);
    const to = new Date(now.getTime() + lead + WINDOW_HALF_MS);
    const candidates = await deps.findCandidates(from, to);
    result.considered += candidates.length;
    if (candidates.length === 0) continue;

    const done = await deps.alreadySent(
      window,
      candidates.map((c) => ({ user_id: c.user_id, stage_id: c.stage_id })),
    );

    for (const c of candidates) {
      if (done.has(sentKey(c.user_id, c.stage_id))) {
        result.skippedAlreadySent++;
        continue;
      }
      // Saved after the warning would have been due: do not send "7 days left" about a competition they just found.
      const warnAt = new Date(c.deadline_at).getTime() - lead;
      if (new Date(c.saved_at).getTime() > warnAt + SAVE_SLACK_MS) {
        result.skippedSavedLate++;
        continue;
      }

      const email = warningEmail({
        userName: c.user_name,
        competitionTitle: c.title,
        stageName: c.stage_name,
        deadlineAt: c.deadline_at,
        window,
        registerUrl: c.register_url,
        gameUrl: `${base}/game/${c.slug}`,
        unsubscribeCompetitionUrl: deps.unsubscribe.competitionUrl(c.user_id, c.competition_id),
        unsubscribeAllUrl: deps.unsubscribe.allUrl(c.user_id),
      });

      if (!first && paceMs > 0) await sleep(paceMs);
      first = false;

      try {
        await sendWithRetry(
          deps.mailer,
          {
            to: c.email,
            subject: email.subject,
            html: email.html,
            text: email.text,
            idempotencyKey: idempotencyKey(c.user_id, c.stage_id, window),
            headers: deps.unsubscribe.headers(c.user_id),
          },
          delays,
          sleep,
        );
        // Record only after delivery. If this write fails the next run re-sends with the same
        // idempotency key, which the provider collapses into the original message.
        await deps.recordSent({ user_id: c.user_id, stage_id: c.stage_id, window });
        result.sent++;
      } catch (e) {
        result.failed++;
        result.errors.push({
          user_id: c.user_id,
          stage_id: c.stage_id,
          window,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  return result;
}
