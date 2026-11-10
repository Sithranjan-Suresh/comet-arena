// Daily job (6:30 AM CT): department announcement pages + stored newsletters -> competitions.
//   npm run job:ingest-dept
import { loadDeptEmail, loadDeptPageHtml } from "../lib/fixtures";
import { loadDeptConfig } from "../lib/dept/config";
import { runIngestDept } from "../lib/jobs/ingest-dept";
import { createIngestPostDeps } from "../lib/jobs/ingest-wiring";
import { safeFetchBuffer } from "../lib/net/ssrf";
import { ingestPost } from "../lib/pipeline/ingest-post";
import { getSources } from "../lib/sources";
import { runCli } from "./lib/run";

await runCli("ingest-dept", async (ctx, db) => {
  const sources = getSources();
  const config = loadDeptConfig();
  const ingest = createIngestPostDeps(db);
  const mock = sources.mode === "mock";

  const summary = await runIngestDept({
    pages: config.pages,
    log: ctx.log,
    // Mock mode reads fixtures: no network, and the mock model knows those texts.
    fetchPage: mock
      ? async () => loadDeptPageHtml()
      : async (url) =>
          (
            await safeFetchBuffer(url, {
              accept: "text/html",
              maxBytes: 3_000_000,
              timeoutMs: 15000,
            })
          ).buffer.toString("utf8"),
    alert: async (message) => {
      if (process.env.ADMIN_EMAIL)
        await sources.mailer.send({
          to: process.env.ADMIN_EMAIL,
          subject: "[Comet Arena] ingest-dept alert",
          text: message,
          html: `<p>${message}</p>`,
        });
    },
    store: {
      async getPageHash(pageId) {
        const { data } = await db
          .from("nebula_cache")
          .select("payload")
          .eq("key", `dept:hash:${pageId}`)
          .maybeSingle();
        return ((data?.payload as { hash?: string } | null)?.hash as string | undefined) ?? null;
      },
      async setPageHash(pageId, hash) {
        const { error } = await db.from("nebula_cache").upsert({
          key: `dept:hash:${pageId}`,
          payload: { hash },
          fetched_at: new Date().toISOString(),
        });
        if (error) throw error;
      },
      async knownIds(ids) {
        if (ids.length === 0) return new Set<string>();
        const { data, error } = await db
          .from("ingest_posts")
          .select("ig_post_id")
          .in("ig_post_id", ids)
          .neq("classification", "error");
        if (error) throw error;
        return new Set((data ?? []).map((r) => r.ig_post_id));
      },
      async record({ id, text, url, postedAt, result }) {
        const { error } = await db.from("ingest_posts").upsert(
          {
            ig_post_id: id,
            org_id: null,
            caption: text.slice(0, 2000),
            media_urls: [],
            permalink: url,
            posted_at: postedAt,
            classification: result.class,
            competition_id: result.competitionId,
          },
          { onConflict: "ig_post_id" },
        );
        if (error) throw error;
      },
      async listUnprocessed(limit) {
        if (mock) {
          const m = loadDeptEmail();
          return [
            {
              id: "mock-mail",
              messageId: m.messageId,
              sender: m.from,
              subject: m.subject,
              body: m.text,
              receivedAt: new Date().toISOString(),
            },
          ];
        }
        const { data, error } = await db
          .from("inbound_messages")
          .select("id,message_id,sender,subject,body,received_at")
          .is("processed_at", null)
          .order("received_at")
          .limit(limit);
        if (error) throw error;
        return (data ?? []).map((r) => ({
          id: r.id,
          messageId: r.message_id,
          sender: r.sender,
          subject: r.subject,
          body: r.body,
          receivedAt: r.received_at,
        }));
      },
      async markProcessed(id) {
        if (mock) return;
        const { error } = await db
          .from("inbound_messages")
          .update({ processed_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
      },
    },
    process: (item) =>
      ingestPost(
        {
          images: [],
          caption: item.text,
          source_url: item.sourceUrl ?? undefined,
          posted_at: item.postedAt,
        },
        {
          source: "dept",
          source_url: item.sourceUrl,
          external_id: item.externalId,
          posted_at: item.postedAt,
          caption: item.text,
        },
        ingest,
      ),
  });
  return { ...summary };
});
