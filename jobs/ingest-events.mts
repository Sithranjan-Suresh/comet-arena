// Daily job (5:30 AM CT): UTD Clubs + CampusGroups events in the next 120 days -> competitions.
//   npm run job:ingest-events
import { dedupeExtraction } from "../lib/dedupe";
import { supabaseDedupeStore } from "../lib/dedupe-store";
import { runIngestEvents } from "../lib/jobs/ingest-events";
import { publishExtraction } from "../lib/pipeline/publish";
import { supabasePublishStore } from "../lib/pipeline/supabase-store";
import { getSources } from "../lib/sources";
import { runCli } from "./lib/run";

await runCli("ingest-events", async (ctx, db) => {
  const sources = getSources();
  const store = supabasePublishStore(db);
  const summary = await runIngestEvents({
    sources: { utdclubs: sources.utdclubsEvents, campusgroups: sources.campusgroups },
    log: ctx.log,
    alert: async (message) => {
      if (process.env.ADMIN_EMAIL)
        await sources.mailer.send({
          to: process.env.ADMIN_EMAIL,
          subject: "[Comet Arena] ingest-events alert",
          text: message,
          html: `<p>${message}</p>`,
        });
    },
    store: {
      async knownIds(ids) {
        if (ids.length === 0) return new Set<string>();
        const { data, error } = await db
          .from("ingest_posts")
          .select("ig_post_id")
          .in("ig_post_id", ids);
        if (error) throw error;
        return new Set((data ?? []).map((r) => r.ig_post_id));
      },
      async record(r) {
        // ingest_posts is the "seen it" ledger for every source; event ids are prefixed with their source.
        const { error } = await db
          .from("ingest_posts")
          .upsert(
            {
              ig_post_id: r.id,
              org_id: null,
              caption: r.title,
              media_urls: [],
              permalink: r.url,
              posted_at: r.startsAt,
              classification: r.classification,
              competition_id: r.competitionId,
            },
            { onConflict: "ig_post_id" },
          );
        if (error) throw error;
      },
    },
    publish: async (extraction, event) => {
      const dedupe = await dedupeExtraction(extraction, {
        embedder: sources.embedder,
        store: supabaseDedupeStore(db),
        postedAt: event.start,
      });
      return publishExtraction(
        {
          extraction,
          dedupe,
          source: {
            source: event.source,
            source_url: event.url,
            external_id: event.externalId,
            posted_at: event.start,
            caption: event.description,
          },
        },
        store,
      );
    },
  });
  return { ...summary };
});
