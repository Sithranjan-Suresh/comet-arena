import { z } from "zod";
import type { DedupeResult } from "@/lib/dedupe";
import {
  type PublishOutcome,
  type PublishStore,
  type PostSource,
  publishExtraction,
} from "@/lib/pipeline/publish";
import { type Extraction, extractionSchema } from "@/lib/schemas";
import type { Embedder } from "@/lib/sources";

export const reviewActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({
    action: z.literal("edit"),
    /** Fields the admin corrected; everything else keeps the extracted value. */
    edits: z.object({
      title: z.string().trim().min(3).max(140).optional(),
      host: z.string().trim().max(120).nullable().optional(),
      categories: extractionSchema.shape.categories.optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      stages: extractionSchema.shape.stages.optional(),
      prize: z.string().trim().max(120).nullable().optional(),
      cost: extractionSchema.shape.cost.optional(),
      format: extractionSchema.shape.format.optional(),
      location: z.string().trim().max(160).nullable().optional(),
      register_url: z.string().trim().url().max(500).nullable().optional(),
    }),
  }),
  z.object({ action: z.literal("merge"), merge_into: z.string().uuid() }),
  z.object({ action: z.literal("reject") }),
]);
export type ReviewAction = z.infer<typeof reviewActionSchema>;

export interface ReviewItem {
  id: string;
  kind: "low_confidence" | "possible_duplicate";
  status: "open" | "done";
  payload: { extraction?: unknown; source?: PostSource; candidates?: unknown[] } | null;
  candidate_competition_id: string | null;
}

export interface ReviewDeps {
  getItem(id: string): Promise<ReviewItem | null>;
  /** Marks the item done. Returns false if someone else already resolved it (concurrent admins). */
  resolve(
    id: string,
    resolution: { action: ReviewAction["action"]; competition_id?: string | null },
  ): Promise<boolean>;
  store: PublishStore;
  embedder: Embedder;
  lookupSlug(competitionId: string): Promise<string | null>;
}

export type ReviewResult =
  | {
      status: 200;
      body: {
        outcome: "published" | "merged" | "rejected";
        competition_id: string | null;
        slug: string | null;
      };
    }
  | { status: 404 | 409 | 422; body: { error: string; message: string } };

const fail = (status: 404 | 409 | 422, error: string, message: string): ReviewResult => ({
  status,
  body: { error, message },
});

/** A human vetted the listing, so it carries the same confidence as a student-confirmed one. */
const HUMAN_CONFIDENCE = 0.9;

export async function resolveReviewItem(
  id: string,
  rawAction: unknown,
  deps: ReviewDeps,
): Promise<ReviewResult> {
  const parsed = reviewActionSchema.safeParse(rawAction);
  if (!parsed.success)
    return fail(422, "invalid_input", parsed.error.issues.map((i) => i.message).join("; "));
  const act = parsed.data;

  const item = await deps.getItem(id);
  if (!item) return fail(404, "not_found", "That review item does not exist.");
  if (item.status !== "open")
    return fail(409, "already_resolved", "Someone already handled this one.");

  if (act.action === "reject") {
    if (!(await deps.resolve(id, { action: "reject" })))
      return fail(409, "already_resolved", "Someone already handled this one.");
    return { status: 200, body: { outcome: "rejected", competition_id: null, slug: null } };
  }

  const base = extractionSchema.safeParse(item.payload?.extraction);
  const source = item.payload?.source;
  if (!base.success || !source)
    return fail(422, "bad_payload", "This item has no usable extraction. Reject it.");

  // Only fields the admin actually sent: the edit schema reuses extraction fields that carry defaults,
  // which would otherwise overwrite untouched values with [] / "unknown".
  const sent = new Set(Object.keys((rawAction as { edits?: object } | null)?.edits ?? {}));
  if (act.action === "edit" && sent.size === 0)
    return fail(422, "invalid_input", "Change at least one field");
  const edits =
    act.action === "edit"
      ? Object.fromEntries(Object.entries(act.edits).filter(([k]) => sent.has(k)))
      : {};
  let extraction: Extraction;
  try {
    extraction = extractionSchema.parse({
      ...base.data,
      ...edits,
      kind: "competition",
      is_competition: true,
      confidence: HUMAN_CONFIDENCE,
    });
  } catch {
    return fail(422, "invalid_input", "The edited fields are not valid.");
  }
  if (extraction.stages.length === 0)
    return fail(422, "invalid_input", "Add at least one dated round before approving.");

  let dedupe: DedupeResult;
  if (act.action === "merge") {
    const slug = await deps.lookupSlug(act.merge_into);
    if (!slug) return fail(422, "invalid_input", "That competition no longer exists.");
    dedupe = {
      action: "merge",
      match: { id: act.merge_into, slug, title: extraction.title ?? "", similarity: 1 },
      embedding: [],
    };
  } else {
    const embedding = await deps.embedder
      .embed(
        `${extraction.title} | ${extraction.host ?? ""} | | ${[...extraction.categories].sort().join(", ")}`,
      )
      .catch(() => null);
    dedupe = { action: "new", embedding, deferred: embedding === null };
  }

  const out: PublishOutcome = await publishExtraction({ extraction, dedupe, source }, deps.store);
  if (out.outcome !== "published" && out.outcome !== "merged")
    return fail(
      409,
      "not_published",
      `The pipeline routed this elsewhere (${out.outcome}). Nothing was changed.`,
    );

  if (!(await deps.resolve(id, { action: act.action, competition_id: out.competition_id })))
    return fail(409, "already_resolved", "Someone already handled this one.");
  const slug = out.outcome === "published" ? out.slug : await deps.lookupSlug(out.competition_id);
  return { status: 200, body: { outcome: out.outcome, competition_id: out.competition_id, slug } };
}
