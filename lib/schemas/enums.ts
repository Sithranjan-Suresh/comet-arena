import { z } from "zod";

/**
 * Single source of truth for every enum in engineering_spec §3.
 * The SQL enums in supabase/migrations must mirror these exactly (checked by tests/enums-sql.test.ts).
 */
export const IG_ACCOUNT_TYPES = ["business", "creator", "personal_or_missing", "unknown"] as const;
export const TIERS = ["campus", "regional", "national"] as const;
export const COSTS = ["free", "paid", "unknown"] as const;
export const FORMATS = ["in_person", "virtual", "hybrid", "unknown"] as const;
export const COMPETITION_STATUSES = ["live", "unverified", "expected", "past", "rejected"] as const;
export const SOURCE_TYPES = [
  "instagram",
  "submission",
  "host",
  "devpost",
  "mlh",
  "dept",
  "utdclubs",
  "campusgroups",
] as const;
export const QUEUE_KINDS = ["low_confidence", "possible_duplicate"] as const;
export const QUEUE_STATUSES = ["open", "done"] as const;
export const SUBMISSION_STATUSES = [
  "pending",
  "published",
  "queued",
  "rejected",
  "merged",
] as const;
export const INGEST_CLASSES = ["competition", "results", "not_competition", "error"] as const;
export const POST_STATUSES = ["open", "closed"] as const;
export const ENTRY_RESULTS = [
  "participated",
  "advanced",
  "finalist",
  "third",
  "second",
  "first",
] as const;
export const WARNING_WINDOWS = ["d7", "d1"] as const;

export const igAccountTypeSchema = z.enum(IG_ACCOUNT_TYPES);
export const tierSchema = z.enum(TIERS);
export const costSchema = z.enum(COSTS);
export const formatSchema = z.enum(FORMATS);
export const competitionStatusSchema = z.enum(COMPETITION_STATUSES);
export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export const queueKindSchema = z.enum(QUEUE_KINDS);
export const queueStatusSchema = z.enum(QUEUE_STATUSES);
export const submissionStatusSchema = z.enum(SUBMISSION_STATUSES);
export const ingestClassSchema = z.enum(INGEST_CLASSES);
export const postStatusSchema = z.enum(POST_STATUSES);
export const entryResultSchema = z.enum(ENTRY_RESULTS);
export const warningWindowSchema = z.enum(WARNING_WINDOWS);

export type IgAccountType = z.infer<typeof igAccountTypeSchema>;
export type Tier = z.infer<typeof tierSchema>;
export type Cost = z.infer<typeof costSchema>;
export type Format = z.infer<typeof formatSchema>;
export type CompetitionStatus = z.infer<typeof competitionStatusSchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;
export type QueueKind = z.infer<typeof queueKindSchema>;
export type QueueStatus = z.infer<typeof queueStatusSchema>;
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;
export type IngestClass = z.infer<typeof ingestClassSchema>;
export type PostStatus = z.infer<typeof postStatusSchema>;
export type EntryResult = z.infer<typeof entryResultSchema>;
export type WarningWindow = z.infer<typeof warningWindowSchema>;

/** Competition categories used by filters, onboarding and the extraction prompt. */
export const CATEGORIES = [
  "case_competition",
  "hackathon",
  "pitch_competition",
  "research",
  "design",
  "speaking",
  "finance",
  "data_science",
  "engineering",
  "health",
  "other",
] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

/** Roles used by onboarding and Free Agency. */
export const ROLES = [
  "dev",
  "design",
  "data",
  "finance",
  "research",
  "speaking",
  "slides",
  "business",
  "pm",
  "writing",
] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const CLASS_YEARS = ["freshman", "sophomore", "junior", "senior", "graduate"] as const;
export const classYearSchema = z.enum(CLASS_YEARS);
export type ClassYear = z.infer<typeof classYearSchema>;
