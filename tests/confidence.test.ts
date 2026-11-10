import { describe, expect, it } from "vitest";
import { PUBLISH_THRESHOLD, scoreConfidence } from "@/lib/extract/confidence";
import { loadFlyerCases } from "@/lib/fixtures";
import { type Extraction, extractionSchema } from "@/lib/schemas";

const stage = { name: "Final", starts_at: null, deadline_at: "2026-12-05T17:00:00-06:00" };
const ex = (over: Partial<Extraction> = {}): Extraction =>
  extractionSchema.parse({
    is_competition: true,
    kind: "competition",
    title: "T",
    confidence: 0.9,
    register_url: "https://example.com/r",
    stages: [stage],
    ...over,
  });

describe("scoreConfidence", () => {
  it("leaves a complete extraction untouched", () => {
    const r = scoreConfidence(ex(), { yearInferred: false });
    expect(r).toMatchObject({ confidence: 0.9, penalties: [], publishable: true });
  });

  it("subtracts 0.1 for each missing item and names the reasons", () => {
    const r = scoreConfidence(ex({ register_url: null, stages: [] }), { yearInferred: true });
    expect(r.confidence).toBe(0.6);
    expect(r.penalties.map((p) => p.reason).sort()).toEqual([
      "no_register_link",
      "no_stage_date",
      "no_year",
    ]);
    expect(r.publishable).toBe(false);
  });

  it("treats exactly 0.8 as publishable despite floating point (0.9 - 0.1)", () => {
    const r = scoreConfidence(ex({ confidence: 0.9 }), { yearInferred: true });
    expect(r.confidence).toBe(0.8);
    expect(r.publishable).toBe(true);
    expect(PUBLISH_THRESHOLD).toBe(0.8);
  });

  it("just below the threshold goes to review", () => {
    expect(scoreConfidence(ex({ confidence: 0.89 }), { yearInferred: true }).publishable).toBe(
      false,
    );
  });

  it("clamps to the 0-1 range", () => {
    expect(
      scoreConfidence(ex({ confidence: 0.15, register_url: null, stages: [] }), {
        yearInferred: true,
      }).confidence,
    ).toBe(0);
    expect(scoreConfidence(ex({ confidence: 1 }), { yearInferred: false }).confidence).toBe(1);
  });

  it("does not penalize recaps or non-competitions", () => {
    const r = scoreConfidence(
      ex({ kind: "results", is_competition: false, register_url: null, stages: [] }),
      { yearInferred: true },
    );
    expect(r.penalties).toEqual([]);
    expect(r.confidence).toBe(0.9);
  });
});

describe("fixtures routed by confidence", () => {
  const score = (id: string) => {
    const c = loadFlyerCases().find((x) => x.id === id)!;
    const yearInferred = c.expected.missing_fields.includes("year");
    return scoreConfidence(c.expected, { yearInferred });
  };

  it("publishes the clean case comp", () => expect(score("f01-ais-case").publishable).toBe(true));
  it("sends the no-link pitch night to review (0.88 - 0.1 = 0.78)", () => {
    const r = score("f05-pitch-night");
    expect(r.confidence).toBe(0.78);
    expect(r.publishable).toBe(false);
  });
  it("publishes the no-year hackathon exactly at the threshold (0.9 - 0.1)", () => {
    expect(score("f06-no-year")).toMatchObject({ confidence: 0.8, publishable: true });
  });
  it("sends the messy flyer to review", () => expect(score("f14-messy").publishable).toBe(false));
});
