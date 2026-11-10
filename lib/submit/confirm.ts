import { z } from "zod";
import type { DedupeResult } from "@/lib/dedupe";
import { publishExtraction, type PublishStore } from "@/lib/pipeline/publish";
import {
  categorySchema,
  classYearSchema,
  costSchema,
  formatSchema,
  type Extraction,
  extractionSchema,
} from "@/lib/schemas";
import type { Embedder } from "@/lib/sources";

const iso = z.string().datetime({ offset: true });

const stageInput = z
  .object({
    name: z.string().trim().min(1, "Name this round").max(80),
    starts_at: iso.nullable().optional(),
    deadline_at: iso,
  })
  .refine((s) => !s.starts_at || Date.parse(s.starts_at) <= Date.parse(s.deadline_at), {
    message: "A round cannot start after it ends",
    path: ["starts_at"],
  });

/** What the student reviewed and edited in the Report a Game preview. */
export const confirmInputSchema = z
  .object({
    title: z.string().trim().min(3, "Add a title").max(140),
    host: z.string().trim().max(120).nullable().optional(),
    categories: z.array(categorySchema).min(1, "Pick at least one category").max(4),
    description: z.string().trim().max(2000).nullable().optional(),
    stages: z.array(stageInput).min(1, "Add at least one round with a date").max(10),
    eligibility: z
      .object({
        majors: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
        class_years: z.array(classYearSchema).default([]),
        team_min: z.number().int().min(1).max(50).nullable().default(null),
        team_max: z.number().int().min(1).max(50).nullable().default(null),
      })
      .default({ majors: [], class_years: [], team_min: null, team_max: null }),
    prize: z.string().trim().max(120).nullable().optional(),
    cost: costSchema.default("unknown"),
    format: formatSchema.default("unknown"),
    location: z.string().trim().max(160).nullable().optional(),
    register_url: z
      .string()
      .trim()
      .url("Enter a full link starting with https://")
      .max(500)
      .nullable()
      .optional(),
    /** The student ticks this when the host has not published a registration link yet. */
    no_link_yet: z.boolean().default(false),
    /** The student said "Same competition?" yes: add a confirmation to this listing instead of a duplicate. */
    merge_into: z.string().uuid().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.register_url && !v.no_link_yet) {
      ctx.addIssue({
        code: "custom",
        path: ["register_url"],
        message: "Add the registration link, or tick “no link yet”",
      });
    }
    if (v.register_url && !/^https?:\/\//i.test(v.register_url)) {
      ctx.addIssue({
        code: "custom",
        path: ["register_url"],
        message: "Use an http or https link",
      });
    }
    const { team_min: min, team_max: max } = v.eligibility;
    if (min != null && max != null && min > max)
      ctx.addIssue({
        code: "custom",
        path: ["eligibility", "team_min"],
        message: "Minimum team size is larger than the maximum",
      });
  });
export type ConfirmInput = z.infer<typeof confirmInputSchema>;

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
