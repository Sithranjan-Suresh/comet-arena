import { z } from "zod";
import {
  categorySchema,
  competitionStatusSchema,
  costSchema,
  entryResultSchema,
  formatSchema,
  postStatusSchema,
  roleSchema,
  sourceTypeSchema,
  tierSchema,
} from "./enums";

export const stageSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  starts_at: z.string().nullable(),
  deadline_at: z.string(),
  order: z.number().int(),
});
export type Stage = z.infer<typeof stageSchema>;

export const eligibilitySchema = z.object({
  majors: z.array(z.string()),
  class_years: z.array(z.string()),
  course_prereqs: z.array(z.string()),
  team_min: z.number().int().nullable(),
  team_max: z.number().int().nullable(),
  cross_school: z.boolean(),
});
export type Eligibility = z.infer<typeof eligibilitySchema>;

/** Card shown on The Field, Scouting Report and Schedule. */
export const gameCardDtoSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  host_name: z.string().nullable(),
  host_slug: z.string().nullable(),
  categories: z.array(categorySchema),
  prize: z.string().nullable(),
  status: competitionStatusSchema,
  next_stage: stageSchema.nullable(),
  viewer_saved: z.boolean().default(false),
});
export type GameCardDTO = z.infer<typeof gameCardDtoSchema>;

export const competitionSourceSchema = z.object({
  source: sourceTypeSchema,
  source_url: z.string().nullable(),
  seen_at: z.string(),
});
export type CompetitionSource = z.infer<typeof competitionSourceSchema>;

export const eligibilityVerdictSchema = z.enum(["qualifies", "check", "unknown"]);
export type EligibilityVerdict = z.infer<typeof eligibilityVerdictSchema>;

export const gameDayDtoSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  host_name: z.string().nullable(),
  host_slug: z.string().nullable(),
  categories: z.array(categorySchema),
  description: z.string().nullable(),
  tier: tierSchema,
  prize: z.string().nullable(),
  cost: costSchema,
  format: formatSchema,
  location: z.string().nullable(),
  register_url: z.string().nullable(),
  utd_only: z.boolean(),
  beginner_friendly: z.boolean(),
  status: competitionStatusSchema,
  confirmations: z.number().int(),
  flyer_url: z.string().nullable(),
  updated_at: z.string(),
  stages: z.array(stageSchema),
  eligibility: eligibilitySchema.nullable(),
  sources: z.array(competitionSourceSchema),
  viewer_saved: z.boolean().default(false),
  viewer_eligible: eligibilityVerdictSchema.nullable(),
});
export type GameDayDTO = z.infer<typeof gameDayDtoSchema>;

/** Student-submitted Report a Game result (product_spec CL-2). */
export const submissionRequestSchema = z
  .object({ url: z.string().url().optional() })
  .refine((v) => !!v.url, { message: "Add a link or an image" });
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;

export const freeAgentPostSchema = z.object({
  competition_id: z.string().uuid(),
  roles: z.array(roleSchema).min(1),
  note: z.string().max(280).default(""),
});
export type FreeAgentPostInput = z.infer<typeof freeAgentPostSchema>;

export const freeAgentPatchSchema = z.object({
  roles: z.array(roleSchema).min(1).optional(),
  note: z.string().max(280).optional(),
  status: postStatusSchema.optional(),
});

export const teamOpeningPostSchema = z.object({
  competition_id: z.string().uuid(),
  team_name: z.string().min(1).max(80),
  roles_needed: z.array(roleSchema).min(1),
  note: z.string().max(280).default(""),
});
export type TeamOpeningPostInput = z.infer<typeof teamOpeningPostSchema>;

export const teamOpeningPatchSchema = z.object({
  team_name: z.string().min(1).max(80).optional(),
  roles_needed: z.array(roleSchema).min(1).optional(),
  note: z.string().max(280).optional(),
  status: postStatusSchema.optional(),
});

export const entryInputSchema = z.object({
  competition_id: z.string().uuid(),
  team_name: z.string().max(80).default(""),
  result: entryResultSchema,
  rounds_advanced: z.number().int().min(0).max(20).default(0),
});
export type EntryInput = z.infer<typeof entryInputSchema>;
