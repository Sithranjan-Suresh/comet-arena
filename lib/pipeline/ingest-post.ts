import type { DedupeResult } from "@/lib/dedupe";
import type { ExtractOutcome } from "@/lib/extract/service";
import type { ExtractRequest, Extraction } from "@/lib/schemas";
import { type PostSource, type PublishStore, publishExtraction } from "./publish";

export type IngestClass = "competition" | "results" | "not_competition" | "error";

export interface IngestResult {
  class: IngestClass;
  competitionId: string | null;
  outcome: string;
}

export interface IngestPostDeps {
  extract(req: ExtractRequest): Promise<ExtractOutcome>;
  dedupe(extraction: Extraction, postedAt: string | null): Promise<DedupeResult>;
  store: PublishStore;
}

/**
 * One scraped post through extract, dedupe and publish routing. Infrastructure failures (SourceError)
 * propagate so the post is retried on a later run; a post the model could not read is classified `error`.
 */
export async function ingestPost(
  req: ExtractRequest,
  source: PostSource,
  deps: IngestPostDeps,
): Promise<IngestResult> {
  const out = await deps.extract(req);
  if (!out.ok) return { class: "error", competitionId: null, outcome: "extraction_failed" };

  const ex = out.extraction;
  if (ex.kind === "not_competition")
    return { class: "not_competition", competitionId: null, outcome: "not_competition" };

  const dedupe = await deps.dedupe(ex, source.posted_at);
  const res = await publishExtraction(
    { extraction: ex, meta: out.meta, dedupe, source },
    deps.store,
  );
  switch (res.outcome) {
    case "published":
    case "merged":
      return { class: "competition", competitionId: res.competition_id, outcome: res.outcome };
    case "results_attached":
      return { class: "results", competitionId: res.competition_id, outcome: res.outcome };
    case "results_unmatched":
      return { class: "results", competitionId: null, outcome: res.outcome };
    case "queued_low_confidence":
    case "queued_duplicate":
      return { class: "competition", competitionId: null, outcome: res.outcome };
    default:
      return { class: "not_competition", competitionId: null, outcome: res.outcome };
  }
}
