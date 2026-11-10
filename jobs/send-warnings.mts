// Hourly job: Two-Minute Warning emails (7 days and 1 day before each stage deadline).
//   npm run job:send-warnings         (uses .env.local; SOURCES_MODE=mock logs to the mock mailer)
import { runSendWarnings } from "../lib/jobs/send-warnings";
import { supabaseWarningsStore } from "../lib/jobs/warnings-store";
import { getSources } from "../lib/sources";
import { listUnsubscribeHeaders, unsubscribeUrl } from "../lib/unsubscribe";
import { createJobClient } from "./lib/db";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const result = await runSendWarnings({
  ...supabaseWarningsStore(createJobClient()),
  mailer: getSources().mailer,
  appUrl,
  unsubscribe: {
    competitionUrl: (u, c) => unsubscribeUrl(appUrl, { k: "comp", u, c }),
    allUrl: (u) => unsubscribeUrl(appUrl, { k: "warnings", u }),
    headers: (u) => listUnsubscribeHeaders(appUrl, { k: "warnings", u }),
  },
});

console.log(JSON.stringify({ job: "send-warnings", ...result }));
// A non-zero exit marks the GitHub Actions run as failed so the admin is notified (Task 91).
if (result.failed > 0) process.exitCode = 1;
