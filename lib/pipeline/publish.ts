import {
  type DedupeMatch,
  type DedupeResult,
  type ExistingCompetition,
  fillNullFields,
} from "@/lib/dedupe";
import type { ExtractMeta } from "@/lib/extract/service";
import { type OrgRef, resolveHostOrg } from "@/lib/orgs/resolve";
import type { Extraction, SourceType } from "@/lib/schemas";
import { deriveFlags } from "./flags";

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
  /** Original caption/body text, used for external and beginner-friendly heuristics. */
  caption?: string | null;
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

export interface SourceRow {
  source: SourceType;
  source_url: string | null;
  external_id: string | null;
}

export interface StageRow {
  name: string;
  starts_at: string | null;
  deadline_at: string;
}

/** Persistence port. The Supabase implementation uses the atomic SQL functions (migrations 010-011). */
export interface PublishStore {
  publishCompetition(input: {
    competition: CompetitionInsert;
    stages: StageRow[];
    eligibility: Extraction["eligibility"];
    sources: SourceRow[];
  }): Promise<{ id: string; slug: string }>;
  getForMerge(id: string): Promise<ExistingCompetition>;
  mergeInto(id: string, patch: Partial<ExistingCompetition>, source: SourceRow): Promise<void>;
  addSource(id: string, source: SourceRow): Promise<void>;
  /** Update stage dates in place (ids kept); true when anything changed. Records the change for savers. */
  applyStages(id: string, stages: StageRow[]): Promise<boolean>;
  /** Existing listing a recap post is about (high-threshold title match), or null. */
  findResultTarget(title: string): Promise<DedupeMatch | null>;
  listOrgs(): Promise<OrgRef[]>;
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
      /** The repost carried different stage dates; stages were updated in place and savers will be told. */
      dates_changed: boolean;
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

const DEFAULT_FLAGS = { tier: "campus" as const, utd_only: true, beginner_friendly: false };

export function toCompetitionInsert(
  ex: Extraction,
  source: PostSource,
  embedding: number[] | null,
  deferred: boolean,
  flags: {
    tier: CompetitionInsert["tier"];
    utd_only: boolean;
    beginner_friendly: boolean;
  } = DEFAULT_FLAGS,
): CompetitionInsert {
  return {
    title: (ex.title ?? "").trim() || "Untitled competition",
    host_org_id: source.host_org_id ?? null,
    host_name: ex.host,
    categories: ex.categories,
    description: ex.description,
    tier: flags.tier,
    prize: ex.prize,
    cost: ex.cost,
    format: ex.format,
    location: ex.location,
    register_url: ex.register_url,
    utd_only: flags.utd_only,
    beginner_friendly: flags.beginner_friendly,
    // Recurring annual competitions announced without dates are listed as "expected".
    status: ex.stages.length === 0 ? "expected" : "unverified",
    confidence: ex.confidence,
    flyer_url: source.flyer_url ?? null,
    embedding,
    needs_dedupe: deferred,
    created_by: source.created_by ?? null,
  };
}

const sourceRow = (s: PostSource): SourceRow => ({
  source: s.source,
  source_url: s.source_url,
  external_id: s.external_id,
});

const stageRows = (ex: Extraction): StageRow[] =>
  ex.stages.map((s) => ({ name: s.name, starts_at: s.starts_at, deadline_at: s.deadline_at }));

/** Review-queue payload: everything an admin needs to approve, edit, merge or reject. */
function reviewPayload(input: PublishInput) {
  return { extraction: input.extraction, source: input.source, meta: input.meta ?? null };
}

/**
 * Route one extraction (engineering_spec §1, product_spec CL-1 and §4):
 *   not a competition          -> nothing to store here (ingestion logs the post)
 *   results recap              -> attach to the matching listing, never a new competition
 *   same as existing (>=0.92)  -> merge: add source, +1 confirmation, fill empty fields,
 *                                 update changed dates in place (saves and warnings kept)
 *   possible duplicate         -> review queue
 *   new, confidence >= 0.8     -> publish as `unverified`
 *   new, confidence <  0.8     -> review queue (low confidence)
 */
export async function publishExtraction(
  input: PublishInput,
  store: PublishStore,
): Promise<PublishOutcome> {
  const { extraction: ex, dedupe, source } = input;

  if (ex.kind === "not_competition") return { outcome: "not_competition" };

  if (ex.kind === "results") {
    // Recaps carry no dates, so match by title (high threshold: "Spring" never matches "Fall").
    const byTitle = ex.title ? await store.findResultTarget(ex.title) : null;
    const match = byTitle ?? (dedupe.action === "merge" ? dedupe.match : null);
    if (!match) return { outcome: "results_unmatched" };
    await store.addSource(match.id, sourceRow(source));
    return { outcome: "results_attached", competition_id: match.id };
  }

  if (dedupe.action === "merge") {
    const existing = await store.getForMerge(dedupe.match.id);
    const patch = fillNullFields(existing, { ...ex, flyer_url: source.flyer_url ?? null });
    await store.mergeInto(dedupe.match.id, patch, sourceRow(source));
    const dates_changed = await store.applyStages(dedupe.match.id, stageRows(ex));
    return {
      outcome: "merged",
      competition_id: dedupe.match.id,
      similarity: dedupe.match.similarity,
      patch,
      dates_changed,
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

  if (ex.confidence < 0.8) {
    const review_id = await store.enqueueReview({
      kind: "low_confidence",
      candidate_competition_id: null,
      payload: reviewPayload(input),
    });
    return { outcome: "queued_low_confidence", review_id };
  }

  const hostOrgId =
    source.host_org_id ?? resolveHostOrg(ex.host, await store.listOrgs())?.id ?? null;
  const flags = deriveFlags(ex, { caption: source.caption, hostOrgId, source: source.source });
  const created = await store.publishCompetition({
    competition: toCompetitionInsert(
      ex,
      { ...source, host_org_id: hostOrgId },
      dedupe.embedding,
      dedupe.deferred,
      flags,
    ),
    stages: stageRows(ex),
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
