import { changeEmail } from "@/lib/email/templates";
import type { Mailer } from "@/lib/sources";
import { realSleep, sendWithRetry } from "./mail";

export interface StageSnapshot {
  name: string;
  starts_at: string | null;
  deadline_at: string;
}

export interface PendingChange {
  id: string;
  competition_id: string;
  created_at: string;
  title: string;
  slug: string;
  before: StageSnapshot[];
  after: StageSnapshot[];
}

export interface Saver {
  user_id: string;
  email: string;
  name: string | null;
}

export interface StageChange {
  stageName: string;
  before: string | null;
  after: string | null;
}

/** Changes older than this are retired without emailing (stale news is worse than none). */
export const STALE_AFTER_MS = 7 * 86_400_000;

const key = (n: string) => n.trim().toLowerCase();

/**
 * Which stages moved, appeared or disappeared. Compared by stage name; only deadline changes count
 * (a change in `starts_at` alone does not move anyone's due date).
 */
export function diffStages(before: StageSnapshot[], after: StageSnapshot[]): StageChange[] {
  const b = new Map(before.map((s) => [key(s.name), s]));
  const a = new Map(after.map((s) => [key(s.name), s]));
  const changes: StageChange[] = [];
  for (const [k, s] of a) {
    const old = b.get(k);
    if (!old) changes.push({ stageName: s.name, before: null, after: s.deadline_at });
    else if (new Date(old.deadline_at).getTime() !== new Date(s.deadline_at).getTime()) {
      changes.push({ stageName: s.name, before: old.deadline_at, after: s.deadline_at });
    }
  }
  for (const [k, s] of b)
    if (!a.has(k)) changes.push({ stageName: s.name, before: s.deadline_at, after: null });
  return changes.sort((x, y) =>
    (x.after ?? x.before ?? "").localeCompare(y.after ?? y.before ?? ""),
  );
}

export interface NotifyDeps {
  loadPending(): Promise<PendingChange[]>;
  /** Savers with warnings on who have not muted this competition. */
  loadSavers(competitionId: string): Promise<Saver[]>;
  markNotified(changeId: string, at: Date): Promise<void>;
  mailer: Mailer;
  appUrl: string;
  unsubscribe: {
    competitionUrl(userId: string, competitionId: string): string;
    headers(userId: string): Record<string, string>;
  };
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
  paceMs?: number;
  retryDelaysMs?: number[];
}

export interface NotifyResult {
  changes: number;
  emails: number;
  failed: number;
  retiredStale: number;
  skippedNoChange: number;
  errors: { change_id: string; to: string; message: string }[];
}

/** Email savers once when a competition's dates change. */
export async function runNotifyChanges(deps: NotifyDeps): Promise<NotifyResult> {
  const now = deps.now ?? new Date();
  const sleep = deps.sleep ?? realSleep;
  const delays = deps.retryDelaysMs ?? [1000, 4000, 15000];
  const paceMs = deps.paceMs ?? 550;
  const base = deps.appUrl.replace(/\/+$/, "");
  const result: NotifyResult = {
    changes: 0,
    emails: 0,
    failed: 0,
    retiredStale: 0,
    skippedNoChange: 0,
    errors: [],
  };
  let first = true;

  for (const ch of await deps.loadPending()) {
    result.changes++;
    if (now.getTime() - new Date(ch.created_at).getTime() > STALE_AFTER_MS) {
      await deps.markNotified(ch.id, now);
      result.retiredStale++;
      continue;
    }
    const diff = diffStages(ch.before, ch.after);
    if (diff.length === 0) {
      await deps.markNotified(ch.id, now);
      result.skippedNoChange++;
      continue;
    }

    let allOk = true;
    for (const s of await deps.loadSavers(ch.competition_id)) {
      const email = changeEmail({
        userName: s.name,
        competitionTitle: ch.title,
        gameUrl: `${base}/game/${ch.slug}`,
        changes: diff,
        unsubscribeCompetitionUrl: deps.unsubscribe.competitionUrl(s.user_id, ch.competition_id),
      });
      if (!first && paceMs > 0) await sleep(paceMs);
      first = false;
      try {
        await sendWithRetry(
          deps.mailer,
          {
            to: s.email,
            subject: email.subject,
            html: email.html,
            text: email.text,
            idempotencyKey: `change:${ch.id}:${s.user_id}`,
            headers: deps.unsubscribe.headers(s.user_id),
          },
          delays,
          sleep,
        );
        result.emails++;
      } catch (e) {
        allOk = false;
        result.failed++;
        result.errors.push({
          change_id: ch.id,
          to: s.email,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    // Leave it pending if anyone failed: the next run retries, and idempotency keys stop duplicates.
    if (allOk) await deps.markNotified(ch.id, now);
  }
  return result;
}
