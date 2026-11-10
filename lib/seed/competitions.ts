import { z } from "zod";
import { chicagoDateParts, chicagoToUtc } from "../tz";
import {
  categorySchema,
  competitionStatusSchema,
  costSchema,
  formatSchema,
  tierSchema,
} from "../schemas/enums";

const stageFixture = z.object({
  name: z.string(),
  deadline_offset_days: z.number().int(),
  hour: z.number().int().min(0).max(23).default(23),
  minute: z.number().int().min(0).max(59).default(59),
  starts_offset_days: z.number().int().optional(),
  starts_hour: z.number().int().min(0).max(23).default(9),
});

export const competitionFixtureSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  host_org_slug: z.string().default(""),
  host_name: z.string().nullable(),
  categories: z.array(categorySchema).min(1),
  description: z.string(),
  tier: tierSchema,
  prize: z.string().nullable(),
  cost: costSchema,
  format: formatSchema,
  location: z.string().nullable(),
  register_url: z.string().url().nullable(),
  utd_only: z.boolean(),
  beginner_friendly: z.boolean(),
  status: competitionStatusSchema,
  stages: z.array(stageFixture),
  eligibility: z.object({
    majors: z.array(z.string()),
    class_years: z.array(z.string()),
    team_min: z.number().int().nullable(),
    team_max: z.number().int().nullable(),
    cross_school: z.boolean(),
  }),
});
export type CompetitionFixture = z.infer<typeof competitionFixtureSchema>;

export const starterFileSchema = z.object({ competitions: z.array(competitionFixtureSchema) });

export interface SeedStage {
  name: string;
  starts_at: string | null;
  deadline_at: string;
  order: number;
}
export interface SeedCompetition {
  slug: string;
  host_org_slug: string;
  competition: {
    slug: string;
    title: string;
    host_name: string | null;
    categories: string[];
    description: string;
    tier: CompetitionFixture["tier"];
    prize: string | null;
    cost: CompetitionFixture["cost"];
    format: CompetitionFixture["format"];
    location: string | null;
    register_url: string | null;
    utd_only: boolean;
    beginner_friendly: boolean;
    status: CompetitionFixture["status"];
    confidence: number;
  };
  stages: SeedStage[];
  eligibility: CompetitionFixture["eligibility"];
}

/** Wall-clock America/Chicago time `offsetDays` after today's Chicago date. */
function atOffset(now: Date, offsetDays: number, hour: number, minute: number): string {
  const { year, month, day } = chicagoDateParts(now);
  const d = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return chicagoToUtc(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    hour,
    minute,
  ).toISOString();
}

/** Pure: turn fixtures into rows relative to `now`. */
export function buildSeedCompetitions(
  fixtures: CompetitionFixture[],
  now: Date,
): SeedCompetition[] {
  return fixtures.map((f) => ({
    slug: f.slug,
    host_org_slug: f.host_org_slug,
    competition: {
      slug: f.slug,
      title: f.title,
      host_name: f.host_name,
      categories: f.categories,
      description: f.description,
      tier: f.tier,
      prize: f.prize,
      cost: f.cost,
      format: f.format,
      location: f.location,
      register_url: f.register_url,
      utd_only: f.utd_only,
      beginner_friendly: f.beginner_friendly,
      status: f.status,
      confidence: 1,
    },
    stages: f.stages.map((s, i) => ({
      name: s.name,
      starts_at:
        s.starts_offset_days === undefined
          ? null
          : atOffset(now, s.starts_offset_days, s.starts_hour, 0),
      deadline_at: atOffset(now, s.deadline_offset_days, s.hour, s.minute),
      order: i + 1,
    })),
    eligibility: f.eligibility,
  }));
}
