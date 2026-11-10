// Weekly job (Sunday 6 PM CT): Comet Arena Weekly digest.
//   npm run job:send-digest
import { supabaseDigestStore } from "../lib/jobs/digest-store";
import { runSendDigest } from "../lib/jobs/send-digest";
import { getSources } from "../lib/sources";
import { listUnsubscribeHeaders, unsubscribeUrl } from "../lib/unsubscribe";
import { createJobClient } from "./lib/db";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const result = await runSendDigest({
  ...supabaseDigestStore(createJobClient()),
  mailer: getSources().mailer,
  appUrl,
  unsubscribe: {
    userUrl: (u) => unsubscribeUrl(appUrl, { k: "digest", u }),
    userHeaders: (u) => listUnsubscribeHeaders(appUrl, { k: "digest", u }),
    subscriberUrl: (e) => unsubscribeUrl(appUrl, { k: "sub", e }),
    subscriberHeaders: (e) => listUnsubscribeHeaders(appUrl, { k: "sub", e }),
  },
});

console.log(JSON.stringify({ job: "send-digest", ...result }));
if (result.failed > 0) process.exitCode = 1;
