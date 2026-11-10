// Daily job (5 AM CT): Devpost + MLH listings (DFW and virtual) -> extract -> dedupe -> publish.
//   npm run job:ingest-feeds
import { runIngestFeeds } from "../lib/jobs/ingest-feeds";
import { createIngestPostDeps } from "../lib/jobs/ingest-wiring";
import { ingestPost } from "../lib/pipeline/ingest-post";
import { getSources } from "../lib/sources";
import { runCli } from "./lib/run";

await runCli("ingest-feeds", async (ctx, db) => {
  const sources = getSources();
  const ingest = createIngestPostDeps(db);
  const summary = await runIngestFeeds({
    feeds: { devpost: sources.devpost, mlh: sources.mlh },
    log: ctx.log,
    alert: async (message) => {
      if (process.env.ADMIN_EMAIL)
        await sources.mailer.send({
          to: process.env.ADMIN_EMAIL,
          subject: "[Comet Arena] ingest-feeds alert",
          text: message,
          html: `<p>${message}</p>`,
        });
    },
    store: {
      async knownExternalIds(source, ids) {
        if (ids.length === 0) return new Set<string>();
        const { data, error } = await db
          .from("competition_sources")
          .select("external_id")
          .eq("source", source)
          .in("external_id", ids);
        if (error) throw error;
        return new Set((data ?? []).map((r) => r.external_id as string));
      },
    },
    processListing: (l) =>
      ingestPost(
        { images: [], caption: `${l.title}\n${l.text}`, source_url: l.url, posted_at: l.postedAt },
        {
          source: l.source,
          source_url: l.url,
          external_id: l.externalId,
          posted_at: l.postedAt,
          caption: l.text,
        },
        ingest,
      ),
  });
  return { ...summary };
});
