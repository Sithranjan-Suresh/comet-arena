import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mailer } from "@/lib/sources";
import type { Database, Json } from "@/lib/supabase/database.types";
import { escapeHtml } from "@/lib/email/html";

/** Where a resumable job remembers how far it got (nebula_cache row `job-cursor:<name>`). */
export interface CursorStore {
  get(name: string): Promise<unknown | null>;
  set(name: string, cursor: unknown): Promise<void>;
  clear(name: string): Promise<void>;
}

export interface JobContext<C = unknown> {
  name: string;
  /** Cursor saved by an earlier failed run, or null for a fresh start. */
  cursor: C | null;
  /** Persist progress; call after each unit of work so a rerun resumes here. */
  checkpoint(cursor: C): Promise<void>;
  log(event: string, data?: Record<string, unknown>): void;
}

export interface JobResult {
  name: string;
  ok: boolean;
  resumed: boolean;
  durationMs: number;
  summary?: Record<string, unknown>;
  error?: string;
}

export interface RunJobDeps {
  cursors: CursorStore;
  mailer?: Mailer;
  adminEmail?: string | null;
  write?: (line: string) => void;
  now?: () => number;
}

/**
 * Run a job with structured JSON-line logging, a run summary, a resume cursor and an admin failure email.
 * A failure never throws out of here: it is logged, emailed (best effort) and returned with ok=false so
 * the entry point can set a non-zero exit code. The cursor is cleared only on success.
 */
export async function runJob<C = unknown>(
  name: string,
  fn: (ctx: JobContext<C>) => Promise<Record<string, unknown> | void>,
  deps: RunJobDeps,
): Promise<JobResult> {
  const write = deps.write ?? ((l: string) => console.log(l));
  const now = deps.now ?? Date.now;
  const started = now();
  const emit = (event: string, data: Record<string, unknown> = {}) =>
    write(JSON.stringify({ job: name, event, ...data }));

  let cursor: C | null = null;
  try {
    cursor = ((await deps.cursors.get(name)) as C | null) ?? null;
  } catch {
    cursor = null; // a broken cursor store must not stop the job; it just starts fresh
  }
  const resumed = cursor !== null;
  emit("start", { resumed });

  const ctx: JobContext<C> = {
    name,
    cursor,
    log: emit,
    checkpoint: async (c) => {
      try {
        await deps.cursors.set(name, c);
      } catch (e) {
        emit("checkpoint_failed", { error: String((e as Error).message ?? e) });
      }
    },
  };

  try {
    const summary = (await fn(ctx)) ?? undefined;
    // A job that stopped early on purpose (quota, time budget) returns incomplete:true and keeps its cursor.
    if (!summary || summary.incomplete !== true) await deps.cursors.clear(name).catch(() => {});
    const result: JobResult = { name, ok: true, resumed, durationMs: now() - started, summary };
    emit("done", { durationMs: result.durationMs, ...summary });
    return result;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const result: JobResult = { name, ok: false, resumed, durationMs: now() - started, error };
    emit("failed", { durationMs: result.durationMs, error });
    await notifyAdmin(deps, name, error, emit);
    return result;
  }
}

async function notifyAdmin(
  deps: RunJobDeps,
  name: string,
  error: string,
  emit: (e: string, d?: Record<string, unknown>) => void,
) {
  if (!deps.mailer || !deps.adminEmail) {
    emit("admin_not_notified", { reason: "no mailer or ADMIN_EMAIL configured" });
    return;
  }
  try {
    await deps.mailer.send({
      to: deps.adminEmail,
      subject: `[Comet Arena] job failed: ${name}`,
      text: `Job "${name}" failed.\n\n${error}\n\nIt will resume from its last checkpoint on the next run.`,
      html: `<p>Job <strong>${escapeHtml(name)}</strong> failed.</p><pre>${escapeHtml(error)}</pre><p>It will resume from its last checkpoint on the next run.</p>`,
      // One email per job per day, so a retrying schedule does not spam the admin.
      idempotencyKey: `job-failed:${name}:${new Date(deps.now?.() ?? Date.now()).toISOString().slice(0, 10)}`,
    });
  } catch (e) {
    emit("admin_email_failed", { error: String((e as Error).message ?? e) });
  }
}

const key = (name: string) => `job-cursor:${name}`;

export function supabaseCursorStore(db: SupabaseClient<Database>): CursorStore {
  return {
    async get(name) {
      const { data, error } = await db
        .from("nebula_cache")
        .select("payload")
        .eq("key", key(name))
        .maybeSingle();
      if (error) throw error;
      return data?.payload ?? null;
    },
    async set(name, cursor) {
      const { error } = await db
        .from("nebula_cache")
        .upsert({ key: key(name), payload: cursor as Json, fetched_at: new Date().toISOString() });
      if (error) throw error;
    },
    async clear(name) {
      const { error } = await db.from("nebula_cache").delete().eq("key", key(name));
      if (error) throw error;
    },
  };
}

export function memoryCursorStore(): CursorStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (n) => data.get(n) ?? null,
    set: async (n, c) => void data.set(n, c),
    clear: async (n) => void data.delete(n),
  };
}
