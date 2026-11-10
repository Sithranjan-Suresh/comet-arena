// Daily job (4 AM CT): new Instagram posts from every org with a handle -> extract -> dedupe -> publish.
//   npm run job:ingest-instagram
import { runIngestInstagram } from "../lib/jobs/ingest-instagram";
import { supabaseIngestInstagramStore } from "../lib/jobs/ingest-instagram-store";
import { createIngestPostDeps } from "../lib/jobs/ingest-wiring";
import { ingestPost } from "../lib/pipeline/ingest-post";
import { getSources } from "../lib/sources";
import { createApify } from "../lib/sources/live/apify";
import { runCli } from "./lib/run";

await runCli<{ lastOrgId: string }>("ingest-instagram", async (ctx, db) => {
  const ingest = createIngestPostDeps(db);
  const sources = getSources();
  const apify = process.env.APIFY_TOKEN
    ? createApify({ token: process.env.APIFY_TOKEN })
    : undefined;
  const summary = await runIngestInstagram({
    store: supabaseIngestInstagramStore(db),
    instagram: sources.instagram,
    apify,
    resumeAfter: ctx.cursor?.lastOrgId ?? null,
    checkpoint: (lastOrgId) => ctx.checkpoint({ lastOrgId }),
    log: ctx.log,
    alert: async (message) => {
      if (process.env.ADMIN_EMAIL)
        await sources.mailer.send({
          to: process.env.ADMIN_EMAIL,
          subject: "[Comet Arena] ingest-instagram alert",
          text: message,
          html: `<p>${message}</p>`,
        });
    },
    processPost: (post, org) =>
      ingestPost(
        {
          images: post.mediaUrls.slice(0, 10),
          caption: post.caption ?? undefined,
          source_url: post.permalink,
          posted_at: post.postedAt,
        },
        {
          source: "instagram",
          source_url: post.permalink,
          external_id: post.id,
          posted_at: post.postedAt,
          host_org_id: org.id,
          flyer_url: post.mediaUrls[0] ?? null,
          caption: post.caption,
        },
        ingest,
      ),
  });
  console.log(
    JSON.stringify({
      job: "ingest-instagram",
      budget: summary.elapsedMs <= 30 * 60_000 ? "within 30m" : "OVER 30m",
      ...summary,
    }),
  );
  return { ...summary };
});
