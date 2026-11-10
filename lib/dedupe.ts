import type { Extraction } from "@/lib/schemas";
import type { Embedder } from "@/lib/sources";

/** Engineering_spec §5 thresholds (tuned on the dedupe eval set, Task 106). */
export const MERGE_THRESHOLD = 0.92;
export const REVIEW_THRESHOLD = 0.8;
export const WINDOW_DAYS = 45;

export interface DedupeMatch {
  id: string;
  slug: string;
  title: string;
  similarity: number;
}

export type DedupeDecision = "merge" | "review" | "new";

/** Pure: which band a similarity falls in. */
export function decideBand(similarity: number): DedupeDecision {
  if (similarity >= MERGE_THRESHOLD) return "merge";
  if (similarity >= REVIEW_THRESHOLD) return "review";
  return "new";
}

/** `title | host | first deadline (YYYY-MM-DD) | categories` (engineering_spec §5). */
export function buildEmbeddingText(
  ex: Pick<Extraction, "title" | "host" | "categories" | "stages">,
): string {
  const first = [...ex.stages].sort((a, b) => a.deadline_at.localeCompare(b.deadline_at))[0];
  const date = first ? toIsoDay(first.deadline_at) : "";
  const cats = [...ex.categories].sort().join(", ");
  return [ex.title ?? "", ex.host ?? "", date, cats].join(" | ");
}

/** YYYY-MM-DD of an instant in America/Chicago. */
function toIsoDay(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** Persistence port: similar competitions with any stage within the window of `around`. */
export interface DedupeStore {
  findMatches(args: {
    embedding: number[];
    around: Date;
    windowDays: number;
    minSimilarity: number;
  }): Promise<DedupeMatch[]>;
}

export type DedupeResult =
  | { action: "merge"; match: DedupeMatch; embedding: number[] }
  | { action: "review"; candidates: DedupeMatch[]; embedding: number[] }
  | {
      action: "new";
      embedding: number[] | null;
      /** Embedding service was down: re-run dedupe later. */ deferred: boolean;
    };

export async function dedupeExtraction(
  ex: Extraction,
  deps: { embedder: Embedder; store: DedupeStore; postedAt?: string | null; now?: Date },
): Promise<DedupeResult> {
  let embedding: number[];
  try {
    embedding = await deps.embedder.embed(buildEmbeddingText(ex));
  } catch {
    // Embedding API down: publish as new and flag for a later dedupe pass (product_spec §5).
    return { action: "new", embedding: null, deferred: true };
  }

  const first = [...ex.stages].sort((a, b) => a.deadline_at.localeCompare(b.deadline_at))[0];
  const posted =
    deps.postedAt && !Number.isNaN(Date.parse(deps.postedAt)) ? new Date(deps.postedAt) : null;
  const around = first ? new Date(first.deadline_at) : (posted ?? deps.now ?? new Date());

  const matches = (
    await deps.store.findMatches({
      embedding,
      around,
      windowDays: WINDOW_DAYS,
      minSimilarity: REVIEW_THRESHOLD,
    })
  ).sort((a, b) => b.similarity - a.similarity);

  const best = matches[0];
  if (!best) return { action: "new", embedding, deferred: false };
  const band = decideBand(best.similarity);
  if (band === "merge") return { action: "merge", match: best, embedding };
  if (band === "review")
    return {
      action: "review",
      candidates: matches.filter((m) => decideBand(m.similarity) !== "new"),
      embedding,
    };
  return { action: "new", embedding, deferred: false };
}

/** pgvector text literal for PostgREST: "[0.1,0.2,...]". */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}

export interface ExistingCompetition {
  host_name: string | null;
  description: string | null;
  prize: string | null;
  location: string | null;
  register_url: string | null;
  flyer_url: string | null;
  categories: string[];
  cost: "free" | "paid" | "unknown";
  format: "in_person" | "virtual" | "hybrid" | "unknown";
}

/**
 * On merge: fill ONLY fields that are empty on the existing listing (never overwrite what is
 * already known, spec §5). Returns the patch to apply (possibly empty).
 */
export function fillNullFields(
  existing: ExistingCompetition,
  incoming: Pick<
    Extraction,
    | "host"
    | "description"
    | "prize"
    | "location"
    | "register_url"
    | "categories"
    | "cost"
    | "format"
  > & {
    flyer_url?: string | null;
  },
): Partial<ExistingCompetition> {
  const patch: Partial<ExistingCompetition> = {};
  const fill = <
    K extends "host_name" | "description" | "prize" | "location" | "register_url" | "flyer_url",
  >(
    key: K,
    value: string | null | undefined,
  ) => {
    if (!existing[key] && value) patch[key] = value as ExistingCompetition[K];
  };
  fill("host_name", incoming.host);
  fill("description", incoming.description);
  fill("prize", incoming.prize);
  fill("location", incoming.location);
  fill("register_url", incoming.register_url);
  fill("flyer_url", incoming.flyer_url);
  if (existing.categories.length === 0 && incoming.categories.length > 0)
    patch.categories = incoming.categories;
  if (existing.cost === "unknown" && incoming.cost !== "unknown") patch.cost = incoming.cost;
  if (existing.format === "unknown" && incoming.format !== "unknown")
    patch.format = incoming.format;
  return patch;
}
