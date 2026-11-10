import { z } from "zod";
import { CATEGORIES, CLASS_YEARS, ROLES } from "./enums";

const dedupe = <T extends string>(arr: T[]) => [...new Set(arr)];

/** Fields a student can edit about themselves (onboarding and settings). All optional: PATCH-style. */
export const profileInputSchema = z.object({
  major: z
    .string()
    .trim()
    .max(80)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  class_year: z.enum(CLASS_YEARS).nullable().optional(),
  interests: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length).transform(dedupe).optional(),
  roles: z.array(z.enum(ROLES)).max(ROLES.length).transform(dedupe).optional(),
  email_warnings: z.boolean().optional(),
  digest: z.boolean().optional(),
  /** Set true when onboarding is completed OR skipped, so the user is not asked again. */
  onboarded: z.boolean().optional(),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export interface ProfileData {
  major: string | null;
  class_year: string | null;
  interests: string[];
  roles: string[];
  email_warnings: boolean;
  digest: boolean;
  onboarded: boolean;
}
