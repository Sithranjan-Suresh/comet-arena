import { type DedupeStore, REVIEW_THRESHOLD, WINDOW_DAYS, buildEmbeddingText } from "@/lib/dedupe";
import type { Embedder } from "@/lib/sources";

export interface PendingDedupe {
  id: string;
  title: string;
  host: string | null;
  categories: string[];
  /** Earliest stage deadline (ISO), or null when undated. */
  first_deadline: string | null;
  created_at: string;
}

export interface RededupeStore {
  listPending(limit: number): Promise<PendingDedupe[]>;
  /** Saves the embedding and clears needs_dedupe. */
  markDeduped(id: string, embedding: number[]): Promise<void>;
  enqueuePostHoc(item: {
    newId: string;
    newTitle: string;
    candidateId: string;
    similarity: number;
  }): Promise<void>;
}

export interface RededupeSummary {
  checked: number;
  duplicates_flagged: number;
  still_pending: number;
}

/**
 * Listings published while the embedding service was down carry `needs_dedupe`. Once it is back, embed them
 * and look for lookalikes. They may already have saves, so a match is never merged automatically: it goes to
 * the review queue for a person to keep both or hide the newer listing.
 */
export async function runRededupe(deps: {
  store: RededupeStore;
  embedder: Embedder;
  dedupe: DedupeStore;
  limit?: number;
  now?: Date;
}): Promise<RededupeSummary> {
  const s: RededupeSummary = { checked: 0, duplicates_flagged: 0, still_pending: 0 };
  for (const c of await deps.store.listPending(deps.limit ?? 100)) {
    let embedding: number[];
    try {
      embedding = await deps.embedder.embed(
        buildEmbeddingText({
          title: c.title,
          host: c.host,
          categories: c.categories as never,
          stages: c.first_deadline
            ? [{ name: "", starts_at: null, deadline_at: c.first_deadline }]
            : [],
        }),
      );
    } catch {
      // Still down: leave the flag set, try again tomorrow. Do not hammer a failing service.
      s.still_pending++;
      break;
    }
    const around = c.first_deadline ? new Date(c.first_deadline) : new Date(c.created_at);
    const matches = (
      await deps.dedupe.findMatches({
        embedding,
        around,
        windowDays: WINDOW_DAYS,
        minSimilarity: REVIEW_THRESHOLD,
      })
    ).filter((m) => m.id !== c.id);
    const best = matches.sort((a, b) => b.similarity - a.similarity)[0];
    if (best) {
      await deps.store.enqueuePostHoc({
        newId: c.id,
        newTitle: c.title,
        candidateId: best.id,
        similarity: best.similarity,
      });
      s.duplicates_flagged++;
    }
    await deps.store.markDeduped(c.id, embedding);
    s.checked++;
  }
  return s;
}
