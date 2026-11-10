import type { DedupeResult } from "@/lib/dedupe";
import { publishExtraction, type PublishStore } from "@/lib/pipeline/publish";
import { type Extraction, extractionSchema } from "@/lib/schemas";
import type { Embedder } from "@/lib/sources";
import { type ConfirmInput, confirmInputSchema } from "./schema";

export { confirmInputSchema, type ConfirmInput };

export interface SubmissionRecord {
  id: string;
  user_id: string;
  raw_url: string | null;
  image_path: string | null;
  status: "pending" | "published" | "queued" | "rejected" | "merged";
  competition_id: string | null;
  merged_into: string | null;
}

export interface ConfirmDeps {
  /** The signed-in user's own submission (RLS), or null. */
  getSubmission(id: string, userId: string): Promise<SubmissionRecord | null>;
  store: PublishStore;
  embedder: Embedder;
  lookupSlug(competitionId: string): Promise<string | null>;
  markDone(
    id: string,
    patch: { status: "published" | "merged"; competition_id?: string; merged_into?: string },
  ): Promise<void>;
  /** Public URL of a stored flyer (storage:bucket/path -> https URL), or null. */
  flyerUrl(imagePath: string | null): string | null;
  now?: Date;
}

export type ConfirmResult =
  | { status: 200; body: { competition_slug: string; outcome: "published" | "merged" } }
  | { status: 404 | 409; body: { error: string; message: string } }
  | { status: 422; body: { error: "invalid_input"; issues: { path: string; message: string }[] } };

/** Whole-run guard: refuse listings whose every round ended more than a day ago. */
const ENDED_GRACE_MS = 86_400_000;

/** Build the extraction a human confirmed. Confidence is high because a person reviewed every field. */
export function extractionFromConfirm(input: ConfirmInput): Extraction {
  const stages = [...input.stages]
    .sort((a, b) => a.deadline_at.localeCompare(b.deadline_at))
    .map((s) => ({ name: s.name, starts_at: s.starts_at ?? null, deadline_at: s.deadline_at }));
  return extractionSchema.parse({
    is_competition: true,
    kind: "competition",
    title: input.title,
    host: input.host || null,
    categories: input.categories,
    description: input.description || null,
    stages,
    eligibility: input.eligibility,
    prize: input.prize || null,
    cost: input.cost,
    format: input.format,
    location: input.location || null,
    register_url: input.register_url || null,
    confidence: 0.9,
    missing_fields: input.register_url ? [] : ["register_url"],
  });
}

export async function confirmSubmission(
  submissionId: string,
  userId: string,
  rawInput: unknown,
  deps: ConfirmDeps,
): Promise<ConfirmResult> {
  const parsed = confirmInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: 422,
      body: {
        error: "invalid_input",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    };
  }
  const input = parsed.data;
  const now = deps.now ?? new Date();

  const sub = await deps.getSubmission(submissionId, userId);
  if (!sub)
    return {
      status: 404,
      body: { error: "not_found", message: "We could not find that submission." },
    };

  // Double click or a second tab: answer with what was already created.
  if (sub.status === "published" || sub.status === "merged") {
    const id = sub.competition_id ?? sub.merged_into;
    const slug = id ? await deps.lookupSlug(id) : null;
    if (slug) return { status: 200, body: { competition_slug: slug, outcome: sub.status } };
  }
  if (sub.status !== "pending") {
    return {
      status: 409,
      body: {
        error: "not_pending",
        message:
          sub.status === "queued"
            ? "We are still reading this one. Try again in a minute."
            : "This submission was already handled.",
      },
    };
  }

  if (input.stages.every((s) => Date.parse(s.deadline_at) < now.getTime() - ENDED_GRACE_MS)) {
    return {
      status: 422,
      body: {
        error: "invalid_input",
        issues: [
          { path: "stages", message: "This competition has already ended. Check the dates." },
        ],
      },
    };
  }

  const extraction = extractionFromConfirm(input);
  const embedding = await deps.embedder
    .embed(
      `${extraction.title} | ${extraction.host ?? ""} | | ${[...extraction.categories].sort().join(", ")}`,
    )
    .catch(() => null);

  let dedupe: DedupeResult;
  if (input.merge_into) {
    const slug = await deps.lookupSlug(input.merge_into);
    if (!slug)
      return {
        status: 422,
        body: {
          error: "invalid_input",
          issues: [{ path: "merge_into", message: "That competition no longer exists." }],
        },
      };
    dedupe = {
      action: "merge",
      match: { id: input.merge_into, slug, title: extraction.title ?? "", similarity: 1 },
      embedding: embedding ?? [],
    };
  } else {
    dedupe = { action: "new", embedding, deferred: embedding === null };
  }

  const outcome = await publishExtraction(
    {
      extraction,
      dedupe,
      source: {
        source: "submission",
        source_url: sub.raw_url,
        external_id: `submission:${sub.id}`,
        posted_at: now.toISOString(),
        flyer_url: deps.flyerUrl(sub.image_path),
        created_by: userId,
      },
    },
    deps.store,
  );

  if (outcome.outcome === "merged") {
    await deps.markDone(sub.id, { status: "merged", merged_into: outcome.competition_id });
    const slug = (await deps.lookupSlug(outcome.competition_id)) ?? "";
    return { status: 200, body: { competition_slug: slug, outcome: "merged" } };
  }
  if (outcome.outcome === "published") {
    await deps.markDone(sub.id, { status: "published", competition_id: outcome.competition_id });
    return { status: 200, body: { competition_slug: outcome.slug, outcome: "published" } };
  }
  // A student-confirmed submission has confidence 0.9, so any other outcome means the pipeline routed it
  // elsewhere (should not happen); surface it rather than pretending it published.
  return {
    status: 409,
    body: {
      error: "not_published",
      message: "We could not publish that right now. An admin will review it.",
    },
  };
}
