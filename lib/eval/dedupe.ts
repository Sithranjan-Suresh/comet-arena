import { z } from "zod";
import {
  MERGE_THRESHOLD,
  REVIEW_THRESHOLD,
  buildEmbeddingText,
  decideBand,
  isSameEvent,
} from "@/lib/dedupe";
import type { Embedder } from "@/lib/sources";

const itemSchema = z.object({
  title: z.string(),
  host: z.string().nullable(),
  categories: z.array(z.string()),
  first_deadline: z.string().datetime({ offset: true }),
});
export const pairSchema = z.object({
  id: z.string(),
  /** A human would call both posts the same event. */
  dup: z.boolean(),
  a: itemSchema,
  b: itemSchema,
  note: z.string().default(""),
});
export const pairsFileSchema = z.object({ pairs: z.array(pairSchema) });
export type Pair = z.infer<typeof pairSchema>;
type Item = z.infer<typeof itemSchema>;

export const embeddingText = (i: Item) =>
  buildEmbeddingText({
    title: i.title,
    host: i.host,
    categories: i.categories as never,
    stages: [{ name: "", starts_at: null, deadline_at: i.first_deadline }],
  });

export function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface ScoredPair {
  pair: Pair;
  similarity: number;
  /** What production does with this pair today (similarity bands plus the same-event promotion). */
  production: "merge" | "review" | "new";
}

export async function scorePairs(pairs: Pair[], embedder: Embedder): Promise<ScoredPair[]> {
  const out: ScoredPair[] = [];
  for (const pair of pairs) {
    const [ea, eb] = [
      await embedder.embed(embeddingText(pair.a)),
      await embedder.embed(embeddingText(pair.b)),
    ];
    const similarity = cosine(ea, eb);
    let production = decideBand(similarity);
    if (
      production === "review" &&
      isSameEvent(
        { title: pair.a.title, host: pair.a.host, first_deadline: pair.a.first_deadline },
        { title: pair.b.title, host_name: pair.b.host, nearest_deadline: pair.b.first_deadline },
      )
    )
      production = "merge";
    out.push({ pair, similarity, production });
  }
  return out;
}

export interface SweepRow {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
}

/** Treat similarity >= t as "duplicate" and score against the labels. */
export function sweep(scored: ScoredPair[], from = 0.6, to = 0.99, step = 0.01): SweepRow[] {
  const rows: SweepRow[] = [];
  for (let t = from; t <= to + 1e-9; t += step) {
    const threshold = Math.round(t * 100) / 100;
    let tp = 0,
      fp = 0,
      fn = 0;
    for (const s of scored) {
      const pred = s.similarity >= threshold;
      if (pred && s.pair.dup) tp++;
      else if (pred) fp++;
      else if (s.pair.dup) fn++;
    }
    rows.push({
      threshold,
      tp,
      fp,
      fn,
      precision: tp + fp === 0 ? null : tp / (tp + fp),
      recall: tp + fn === 0 ? null : tp / (tp + fn),
    });
  }
  return rows;
}

export interface Recommendation {
  /** Lowest threshold with no false merges: auto-merging must never join two different events. */
  merge: number | null;
  /** Lowest threshold that still catches at least 95% of duplicates for human review. */
  review: number | null;
}

export function recommend(rows: SweepRow[]): Recommendation {
  const merge = rows.find((r) => r.fp === 0 && r.tp > 0)?.threshold ?? null;
  // Highest threshold that keeps recall at or above 95%: the fewest non-duplicates sent to review.
  const ok = rows.filter((r) => r.recall !== null && r.recall >= 0.95);
  const review = ok.length ? ok[ok.length - 1].threshold : null;
  return { merge, review };
}

export interface Confusion {
  /** Rows: human label. Columns: production decision. */
  dup: Record<"merge" | "review" | "new", number>;
  nonDup: Record<"merge" | "review" | "new", number>;
}

export function productionConfusion(scored: ScoredPair[]): Confusion {
  const c: Confusion = {
    dup: { merge: 0, review: 0, new: 0 },
    nonDup: { merge: 0, review: 0, new: 0 },
  };
  for (const s of scored) (s.pair.dup ? c.dup : c.nonDup)[s.production]++;
  return c;
}

const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(0)}%`);

export function renderDedupeReport(
  scored: ScoredPair[],
  meta: { generatedOn: string; mock: boolean },
): string {
  const rows = sweep(scored);
  const rec = recommend(rows);
  const conf = productionConfusion(scored);
  const dups = scored.filter((s) => s.pair.dup).length;
  const L: string[] = ["# Dedupe eval report", ""];
  L.push(
    `Generated ${meta.generatedOn}: ${dups} duplicate pairs and ${scored.length - dups} non-duplicate pairs.`,
  );
  if (meta.mock)
    L.push(
      "",
      "> **Mock run.** Similarity comes from the hash-based test embedder, not a real model. Re-run with `SOURCES_MODE=live` before changing thresholds.",
    );
  L.push(
    "",
    "## Current thresholds",
    "",
    `Merge at ${MERGE_THRESHOLD}, human review from ${REVIEW_THRESHOLD}, plus a same-title-and-host promotion from review to merge.`,
    "",
  );
  L.push("| Human label | Merged | Sent to review | Treated as new |", "|---|---:|---:|---:|");
  L.push(`| Duplicate | ${conf.dup.merge} | ${conf.dup.review} | ${conf.dup.new} |`);
  L.push(
    `| Different events | ${conf.nonDup.merge} | ${conf.nonDup.review} | ${conf.nonDup.new} |`,
  );
  L.push(
    "",
    `**False merges: ${conf.nonDup.merge}.** (Must be 0: a wrong merge hides a real competition.)  **Missed duplicates (shown twice): ${conf.dup.new}.**`,
  );
  L.push(
    "",
    "## Threshold sweep",
    "",
    "A pair counts as a duplicate when similarity is at or above the threshold.",
    "",
  );
  L.push(
    "| Threshold | Caught | False positives | Missed | Precision | Recall |",
    "|---:|---:|---:|---:|---:|---:|",
  );
  for (const r of rows.filter((_, i) => i % 2 === 0 || r_isKey(rows[i], rec)))
    L.push(
      `| ${r.threshold.toFixed(2)} | ${r.tp} | ${r.fp} | ${r.fn} | ${pct(r.precision)} | ${pct(r.recall)} |`,
    );
  L.push("", "## Recommendation", "");
  L.push(
    `- Merge threshold: **${rec.merge === null ? "none found" : rec.merge.toFixed(2)}** (lowest value with zero false merges). Currently ${MERGE_THRESHOLD}.`,
  );
  L.push(
    `- Review threshold: **${rec.review === null ? "none found" : rec.review.toFixed(2)}** (highest value that still catches 95% of duplicates). Currently ${REVIEW_THRESHOLD}.`,
  );
  const misses = scored.filter(
    (s) => (s.pair.dup && s.production === "new") || (!s.pair.dup && s.production === "merge"),
  );
  L.push("", `## Pairs production gets wrong (${misses.length})`, "");
  L.push(
    ...(misses.length
      ? misses.map(
          (s) =>
            `- \`${s.pair.id}\` (${s.pair.dup ? "duplicate treated as new" : "different events merged"}), similarity ${s.similarity.toFixed(3)}: "${s.pair.a.title}" vs "${s.pair.b.title}"${s.pair.note ? ` (${s.pair.note})` : ""}`,
        )
      : ["None."]),
  );
  return L.join("\n") + "\n";
}

function r_isKey(r: SweepRow, rec: Recommendation) {
  return (
    r.threshold === rec.merge ||
    r.threshold === rec.review ||
    r.threshold === MERGE_THRESHOLD ||
    r.threshold === REVIEW_THRESHOLD
  );
}
