// Daily job (6 AM CT): dedupe listings that were published while the embedding service was down.
//   npm run job:rededupe
import { supabaseDedupeStore } from "../lib/dedupe-store";
import { toPgVector } from "../lib/dedupe";
import { runRededupe } from "../lib/jobs/rededupe";
import { getSources } from "../lib/sources";
import { runCli } from "./lib/run";

await runCli("rededupe", async (_ctx, db) => {
  const summary = await runRededupe({
    embedder: getSources().embedder,
    dedupe: supabaseDedupeStore(db),
    store: {
      async listPending(limit) {
        const { data, error } = await db
          .from("competitions")
          .select("id,title,host_name,categories,created_at")
          .eq("needs_dedupe", true)
          .neq("status", "rejected")
          .order("created_at")
          .limit(limit);
        if (error) throw error;
        const ids = (data ?? []).map((c) => c.id);
        const { data: stages } = ids.length
          ? await db.from("stages").select("competition_id,deadline_at").in("competition_id", ids)
          : { data: [] };
        const first = new Map<string, string>();
        for (const s of stages ?? []) {
          const cur = first.get(s.competition_id);
          if (!cur || s.deadline_at < cur) first.set(s.competition_id, s.deadline_at);
        }
        return (data ?? []).map((c) => ({
          id: c.id,
          title: c.title,
          host: c.host_name,
          categories: c.categories ?? [],
          first_deadline: first.get(c.id) ?? null,
          created_at: c.created_at,
        }));
      },
      async markDeduped(id, embedding) {
        const { error } = await db
          .from("competitions")
          .update({ embedding: toPgVector(embedding) as never, needs_dedupe: false })
          .eq("id", id);
        if (error) throw error;
      },
      async enqueuePostHoc({ newId, newTitle, candidateId, similarity }) {
        const { error } = await db.from("review_queue").insert({
          kind: "possible_duplicate",
          candidate_competition_id: candidateId,
          payload: { post_hoc: { new_id: newId, new_title: newTitle, similarity } },
        });
        if (error) throw error;
      },
    },
  });
  return { ...summary };
});
