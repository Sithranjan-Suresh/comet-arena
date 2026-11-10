import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeedCompetitions, starterFileSchema } from "@/lib/seed/competitions";
import { chicagoToUtc } from "@/lib/tz";

const fixtures = starterFileSchema.parse(
  JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, "../fixtures/starter-competitions.json"),
      "utf8",
    ),
  ),
).competitions;
const now = new Date("2026-11-10T15:00:00Z");
const built = buildSeedCompetitions(fixtures, now);

describe("starter competitions fixture", () => {
  it("has at least 12 competitions across at least 5 categories", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(12);
    expect(new Set(fixtures.flatMap((f) => f.categories)).size).toBeGreaterThanOrEqual(5);
  });

  it("has unique slugs", () => {
    expect(new Set(fixtures.map((f) => f.slug)).size).toBe(fixtures.length);
  });

  it("covers live, past and expected statuses", () => {
    const statuses = new Set(fixtures.map((f) => f.status));
    for (const s of ["live", "past", "expected"]) expect(statuses.has(s as never)).toBe(true);
  });

  it("gives every live competition at least one stage, in the future", () => {
    for (const c of built.filter((b) => b.competition.status === "live")) {
      expect(c.stages.length).toBeGreaterThan(0);
      expect(c.stages.some((s) => new Date(s.deadline_at) > now)).toBe(true);
    }
  });

  it("keeps past competitions entirely in the past and expected ones without dates", () => {
    for (const c of built.filter((b) => b.competition.status === "past"))
      for (const s of c.stages) expect(new Date(s.deadline_at) < now).toBe(true);
    for (const c of built.filter((b) => b.competition.status === "expected"))
      expect(c.stages).toEqual([]);
  });

  it("never sets a start after the deadline", () => {
    for (const c of built)
      for (const s of c.stages) if (s.starts_at) expect(s.starts_at <= s.deadline_at).toBe(true);
  });
});

describe("chicagoToUtc", () => {
  it("uses CST (UTC-6) in winter and CDT (UTC-5) in summer", () => {
    expect(chicagoToUtc(2026, 11, 20, 23, 59).toISOString()).toBe("2026-11-21T05:59:00.000Z");
    expect(chicagoToUtc(2026, 7, 4, 12, 0).toISOString()).toBe("2026-07-04T17:00:00.000Z");
  });

  it("handles the day of the fall-back transition", () => {
    // 2026-11-01: DST ends at 2:00 AM; noon is CST.
    expect(chicagoToUtc(2026, 11, 1, 12, 0).toISOString()).toBe("2026-11-01T18:00:00.000Z");
  });
});
