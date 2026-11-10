import {
  type JobContext,
  memoryCursorStore,
  runJob,
  supabaseCursorStore,
} from "../../lib/jobs/runner";
import { getSources } from "../../lib/sources";
import { createJobClient } from "./db";

type Db = ReturnType<typeof createJobClient>;

/**
 * Entry-point helper: runs `fn` under the job runner with the real cursor store, mailer and admin email.
 * `needsDb: false` (dry runs, token refresh) skips the Supabase client and keeps the cursor in memory.
 */
export async function runCli<C = unknown>(
  name: string,
  fn: (ctx: JobContext<C>, db: Db) => Promise<Record<string, unknown> | void>,
  opts: { needsDb?: boolean } = {},
) {
  const needsDb = opts.needsDb ?? true;
  const db = needsDb ? createJobClient() : (null as unknown as Db);
  const result = await runJob<C>(name, (ctx) => fn(ctx, db), {
    cursors: needsDb ? supabaseCursorStore(db) : memoryCursorStore(),
    mailer: getSources().mailer,
    adminEmail: process.env.ADMIN_EMAIL,
  });
  if (!result.ok) process.exitCode = 1;
  return result;
}
