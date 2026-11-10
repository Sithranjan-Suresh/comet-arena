import { z } from "zod";
import { categorySchema, classYearSchema, costSchema, formatSchema } from "@/lib/schemas";

// Shared by the Report a Game form (browser) and POST /api/submit/:id/confirm (server), so client-side
// validation and server-side validation can never disagree. Keep this file free of server-only imports.

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
