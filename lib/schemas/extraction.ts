import { z } from "zod";
import { categorySchema, classYearSchema, costSchema, formatSchema } from "./enums";

/** One round of a competition. `deadline_at` is an ISO timestamp (stored UTC, shown in CT). */
export const extractedStageSchema = z.object({
  name: z.string().min(1),
  starts_at: z.string().datetime({ offset: true }).nullable(),
  deadline_at: z.string().datetime({ offset: true }),
});
export type ExtractedStage = z.infer<typeof extractedStageSchema>;

export const extractedEligibilitySchema = z.object({
  majors: z.array(z.string()).default([]),
  class_years: z.array(classYearSchema).default([]),
  team_min: z.number().int().min(1).nullable().default(null),
  team_max: z.number().int().min(1).nullable().default(null),
});

/** POST /api/extract request (engineering_spec §4). */
export const extractRequestSchema = z.object({
  images: z.array(z.string().min(1)).max(10).default([]),
  caption: z.string().optional(),
  source_url: z.string().url().optional(),
  posted_at: z.string().datetime({ offset: true }).optional(),
});
export type ExtractRequest = z.infer<typeof extractRequestSchema>;

export const extractionKindSchema = z.enum(["competition", "results", "not_competition"]);

/** Raw model output, validated before post-processing. */
export const extractionSchema = z.object({
  is_competition: z.boolean(),
  kind: extractionKindSchema,
  title: z.string().nullable().default(null),
  host: z.string().nullable().default(null),
  categories: z.array(categorySchema).default([]),
  description: z.string().nullable().default(null),
  stages: z.array(extractedStageSchema).default([]),
  eligibility: extractedEligibilitySchema.default({
    majors: [],
    class_years: [],
    team_min: null,
    team_max: null,
  }),
  prize: z.string().nullable().default(null),
  cost: costSchema.default("unknown"),
  format: formatSchema.default("unknown"),
  location: z.string().nullable().default(null),
  register_url: z.string().url().nullable().default(null),
  confidence: z.number().min(0).max(1),
  missing_fields: z.array(z.string()).default([]),
});
export type Extraction = z.infer<typeof extractionSchema>;

/** Returned when validation fails twice (spec §4: `kind: error`). */
export const extractionErrorSchema = z.object({
  kind: z.literal("error"),
  reason: z.string(),
});
export type ExtractionError = z.infer<typeof extractionErrorSchema>;

export const extractResponseSchema = z.union([extractionSchema, extractionErrorSchema]);
export type ExtractResponse = z.infer<typeof extractResponseSchema>;
