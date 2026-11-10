import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  entryInputSchema,
  extractionSchema,
  freeAgentPostSchema,
  submissionRequestSchema,
} from "@/lib/schemas";

const sample = {
  is_competition: true,
  kind: "competition",
  title: "UTD Case Competition",
  host: "AIS",
  categories: ["case_competition"],
  description: "Solve a case.",
  stages: [
    { name: "Registration", starts_at: null, deadline_at: "2026-11-20T23:59:00-06:00" },
    {
      name: "Finals",
      starts_at: "2026-12-05T09:00:00-06:00",
      deadline_at: "2026-12-05T17:00:00-06:00",
    },
  ],
  eligibility: { majors: [], class_years: ["junior"], team_min: 2, team_max: 4 },
  prize: "$1,000",
  cost: "free",
  format: "in_person",
  location: "JSOM 2.117",
  register_url: "https://example.com/register",
  confidence: 0.92,
  missing_fields: [],
};

describe("extractionSchema", () => {
  it("parses a complete sample extraction", () => {
    const parsed = extractionSchema.parse(sample);
    expect(parsed.stages).toHaveLength(2);
    expect(parsed.categories).toEqual(["case_competition"]);
  });

  it("fills defaults for omitted optional fields", () => {
    const parsed = extractionSchema.parse({
      is_competition: false,
      kind: "not_competition",
      confidence: 0.4,
    });
    expect(parsed.stages).toEqual([]);
    expect(parsed.cost).toBe("unknown");
    expect(parsed.register_url).toBeNull();
  });

  it("rejects out-of-range confidence and unknown categories", () => {
    expect(extractionSchema.safeParse({ ...sample, confidence: 1.4 }).success).toBe(false);
    expect(extractionSchema.safeParse({ ...sample, categories: ["basketweaving"] }).success).toBe(
      false,
    );
  });

  it("rejects a stage without a timezone offset", () => {
    const bad = {
      ...sample,
      stages: [{ name: "x", starts_at: null, deadline_at: "2026-11-20T23:59:00" }],
    };
    expect(extractionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("input schemas", () => {
  it("requires a link or image on submission", () => {
    expect(submissionRequestSchema.safeParse({}).success).toBe(false);
    expect(submissionRequestSchema.safeParse({ url: "https://instagram.com/p/abc" }).success).toBe(
      true,
    );
  });

  it("caps free agent notes at 280 characters", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(
      freeAgentPostSchema.safeParse({ competition_id: id, roles: ["dev"], note: "x".repeat(281) })
        .success,
    ).toBe(false);
    expect(
      freeAgentPostSchema.safeParse({ competition_id: id, roles: ["dev"], note: "ok" }).success,
    ).toBe(true);
  });

  it("requires at least one role", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(freeAgentPostSchema.safeParse({ competition_id: id, roles: [] }).success).toBe(false);
  });

  it("accepts a valid entry and exposes the category list", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(entryInputSchema.parse({ competition_id: id, result: "first" }).rounds_advanced).toBe(0);
    expect(CATEGORIES).toContain("hackathon");
  });
});
