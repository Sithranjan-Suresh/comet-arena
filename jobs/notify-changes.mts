// Hourly job: tell savers when a competition's dates change.
//   npm run job:notify-changes
import { supabaseChangesStore } from "../lib/jobs/changes-store";
import { runNotifyChanges } from "../lib/jobs/notify-changes";
import { getSources } from "../lib/sources";
import { listUnsubscribeHeaders, unsubscribeUrl } from "../lib/unsubscribe";
import { createJobClient } from "./lib/db";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const result = await runNotifyChanges({
  ...supabaseChangesStore(createJobClient()),
  mailer: getSources().mailer,
  appUrl,
  unsubscribe: {
    competitionUrl: (u, c) => unsubscribeUrl(appUrl, { k: "comp", u, c }),
    headers: (u) => listUnsubscribeHeaders(appUrl, { k: "warnings", u }),
  },
});

console.log(JSON.stringify({ job: "notify-changes", ...result }));
if (result.failed > 0) process.exitCode = 1;
