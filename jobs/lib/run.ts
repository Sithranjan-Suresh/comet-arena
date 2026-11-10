import { type JobContext, runJob, supabaseCursorStore } from "../../lib/jobs/runner";
import { getSources } from "../../lib/sources";
import { createJobClient } from "./db";

/** Entry-point helper: runs `fn` under the job runner with the real cursor store, mailer and admin email. */
export async function runCli<C = unknown>(
  name: string,
  fn: (
    ctx: JobContext<C>,
    db: ReturnType<typeof createJobClient>,
  ) => Promise<Record<string, unknown> | void>,
) {
  const db = createJobClient();
  const result = await runJob<C>(name, (ctx) => fn(ctx, db), {
    cursors: supabaseCursorStore(db),
    mailer: getSources().mailer,
    adminEmail: process.env.ADMIN_EMAIL,
  });
  if (!result.ok) process.exitCode = 1;
  return result;
}
