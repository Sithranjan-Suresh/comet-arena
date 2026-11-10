import {
  type DedupeMatch,
  type DedupeResult,
  type ExistingCompetition,
  fillNullFields,
} from "@/lib/dedupe";
import type { ExtractMeta } from "@/lib/extract/service";
import type { Extraction } from "@/lib/schemas";
import type { SourceType } from "@/lib/schemas";

/** Where a post came from. */
export interface PostSource {
  source: SourceType;
  source_url: string | null;
  /** Stable id (e.g. Instagram post id) so the same post is never attached twice. */
  external_id: string | null;
  posted_at: string | null;
  /** Organization that published it (links the competition to its host org). */
  host_org_id?: string | null;
  /** Public image URL of the flyer. */
  flyer_url?: string | null;
  /** Student who submitted it (Report a Game). */
  created_by?: string | null;
}

export interface CompetitionInsert {
  title: string;
  host_org_id: string | null;
  host_name: string | null;
  categories: string[];
  description: string | null;
  tier: "campus" | "regional" | "national";
  prize: string | null;
  cost: "free" | "paid" | "unknown";
  format: "in_person" | "virtual" | "hybrid" | "unknown";
  location: string | null;
  register_url: string | null;
  utd_only: boolean;
  beginner_friendly: boolean;
  status: "unverified" | "expected";
  confidence: number;
  flyer_url: string | null;
  embedding: number[] | null;
  needs_dedupe: boolean;
  created_by: string | null;
}

/** Persistence port. The Supabase implementation uses the atomic SQL functions from migration 010. */
export interface PublishStore {
  publishCompetition(input: {
    competition: CompetitionInsert;
    stages: { name: string; starts_at: string | null; deadline_at: string }[];
    eligibility: Extraction["eligibility"];
    sources: { source: SourceType; source_url: string | null; external_id: string | null }[];
  }): Promise<{ id: string; slug: string }>;
  getForMerge(id: string): Promise<ExistingCompetition>;
  mergeInto(
    id: string,
    patch: Partial<ExistingCompetition>,
    source: { source: SourceType; source_url: string | null; external_id: string | null },
  ): Promise<void>;
  addSource(
    id: string,
    source: { source: SourceType; source_url: string | null; external_id: string | null },
  ): Promise<void>;
  enqueueReview(item: {
    kind: "low_confidence" | "possible_duplicate";
    candidate_competition_id: string | null;
    payload: unknown;
  }): Promise<string>;
}

export type PublishOutcome =
  | { outcome: "published"; competition_id: string; slug: string; deferred_dedupe: boolean }
  | {
      outcome: "merged";
      competition_id: string;
      similarity: number;
      patch: Partial<ExistingCompetition>;
    }
  | { outcome: "queued_low_confidence"; review_id: string }
  | { outcome: "queued_duplicate"; review_id: string; candidates: DedupeMatch[] }
  | { outcome: "results_attached"; competition_id: string }
  | { outcome: "results_unmatched" }
  | { outcome: "not_competition" };

export interface PublishInput {
  extraction: Extraction;
  meta?: Pick<ExtractMeta, "penalties" | "yearInferred" | "adjustments" | "repaired">;
  dedupe: DedupeResult;
  source: PostSource;
}

/** Fields extraction does not provide get safe defaults; Task 50 refines tier / utd_only / beginner flags. */
export function toCompetitionInsert(
  ex: Extraction,
  source: PostSource,
  embedding: number[] | null,
  deferred: boolean,
): CompetitionInsert {
  return {
    title: (ex.title ?? "").trim() || "Untitled competition",
    host_org_id: source.host_org_id ?? null,
    host_name: ex.host,
    categories: ex.categories,
    description: ex.description,
    tier: "campus",
    prize: ex.prize,
    cost: ex.cost,
    format: ex.format,
    location: ex.location,
    register_url: ex.register_url,
    utd_only: true,
    beginner_friendly: false,
    status: ex.stages.length === 0 ? "expected" : "unverified",
    confidence: ex.confidence,
    flyer_url: source.flyer_url ?? null,
    embedding,
    needs_dedupe: deferred,
    created_by: source.created_by ?? null,
  };
}

const sourceRow = (s: PostSource) => ({
  source: s.source,
  source_url: s.source_url,
  external_id: s.external_id,
});

/** Review-queue payload: everything an admin needs to approve, edit, merge or reject. */
function reviewPayload(input: PublishInput) {
  return {
    extraction: input.extraction,
    source: input.source,
    meta: input.meta ?? null,
  };
}

/**
 * Route one extraction (engineering_spec §1, product_spec CL-1):
 *   not a competition      -> record nothing here (ingestion logs the post)
 *   results recap          -> attach to the matching listing, never a new competition
 *   same as existing (>=0.92) -> merge: add source, +1 confirmation, fill empty fields
 *   possible duplicate     -> review queue
 *   new, confidence >= 0.8 -> publish as `unverified`
 *   new, confidence <  0.8 -> review queue (low confidence)
 */
export async function publishExtraction(
  input: PublishInput,
  store: PublishStore,
): Promise<PublishOutcome> {
  const { extraction: ex, dedupe, source } = input;

  if (ex.kind === "not_competition") return { outcome: "not_competition" };

  if (ex.kind === "results") {
    const match =
      dedupe.action === "merge"
        ? dedupe.match
        : dedupe.action === "review"
          ? dedupe.candidates[0]
          : null;
    if (!match) return { outcome: "results_unmatched" };
    await store.addSource(match.id, sourceRow(source));
    return { outcome: "results_attached", competition_id: match.id };
  }

  if (dedupe.action === "merge") {
    const existing = await store.getForMerge(dedupe.match.id);
    const patch = fillNullFields(existing, { ...ex, flyer_url: source.flyer_url ?? null });
    await store.mergeInto(dedupe.match.id, patch, sourceRow(source));
    return {
      outcome: "merged",
      competition_id: dedupe.match.id,
      similarity: dedupe.match.similarity,
      patch,
    };
  }

  if (dedupe.action === "review") {
    const review_id = await store.enqueueReview({
      kind: "possible_duplicate",
      candidate_competition_id: dedupe.candidates[0]?.id ?? null,
      payload: { ...reviewPayload(input), candidates: dedupe.candidates },
    });
    return { outcome: "queued_duplicate", review_id, candidates: dedupe.candidates };
  }

  const publishable = ex.confidence >= 0.8;
  if (!publishable) {
    const review_id = await store.enqueueReview({
      kind: "low_confidence",
      candidate_competition_id: null,
      payload: reviewPayload(input),
    });
    return { outcome: "queued_low_confidence", review_id };
  }

  const created = await store.publishCompetition({
    competition: toCompetitionInsert(ex, source, dedupe.embedding, dedupe.deferred),
    stages: ex.stages.map((s) => ({
      name: s.name,
      starts_at: s.starts_at,
      deadline_at: s.deadline_at,
    })),
    eligibility: ex.eligibility,
    sources: [sourceRow(source)],
  });
  return {
    outcome: "published",
    competition_id: created.id,
    slug: created.slug,
    deferred_dedupe: dedupe.deferred,
  };
}
