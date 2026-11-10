import { describe, expect, it } from "vitest";
import { getFixtureGameDay, queryFixtureCompetitions } from "@/lib/data/fixture-data";
import { gameDayDtoSchema, gameCardDtoSchema } from "@/lib/schemas";
import { parseCompetitionQuery } from "@/lib/schemas/competition-query";

const now = new Date("2026-11-10T15:00:00Z");
const q = (qs = "") => {
  const r = parseCompetitionQuery(new URLSearchParams(qs));
  if (!r.success) throw new Error(r.error.message);
  return r.data;
};
const titles = (qs = "", limit = 50) =>
  queryFixtureCompetitions({ ...q(qs), limit }, now).items.map((i) => i.title);

describe("fixture-backed Field (dev/mock mode)", () => {
  it("hides past competitions by default and lists upcoming ones soonest first", () => {
    const items = queryFixtureCompetitions({ ...q(), limit: 50 }, now).items;
    expect(items.some((i) => i.status === "past")).toBe(false);
    const dated = items.filter((i) => i.next_stage && new Date(i.next_stage.deadline_at) >= now);
    const times = dated.map((i) => i.next_stage!.deadline_at);
    expect(times).toEqual([...times].sort());
    // undated "expected" competitions come after every dated one
    const firstUndated = items.findIndex((i) => !i.next_stage);
    expect(firstUndated).toBeGreaterThan(dated.length - 1);
  });

  it("includes past competitions only on request", () => {
    expect(titles("include_past=1").some((t) => t.includes("(past)"))).toBe(true);
    expect(titles("").some((t) => t.includes("(past)"))).toBe(false);
  });

  it("filters by category, format, cost, utd_only and beginner", () => {
    expect(titles("categories=hackathon").every((t) => /hack|data|ai/i.test(t))).toBe(true);
    for (const item of queryFixtureCompetitions({ ...q("categories=design"), limit: 50 }, now)
      .items)
      expect(item.categories).toContain("design");
    expect(titles("format=virtual").length).toBeGreaterThan(0);
    expect(titles("cost=paid")).toEqual(["National Collegiate Case Open"]);
    expect(titles("utd_only=0")).toContain("National Collegiate Case Open");
    expect(titles("utd_only=0").length).toBeLessThan(titles("").length);
    expect(titles("beginner=1").length).toBeGreaterThan(0);
  });

  it("searches title, host and description, case-insensitively", () => {
    expect(titles("q=pitch")).toContain("Startup Pitch Night");
    expect(titles("q=HACKUTD")).toContain("Sample Hackathon 24h");
    expect(titles("q=zzzz-nothing")).toEqual([]);
  });

  it("filters by host slug and by deadline window", () => {
    expect(titles("host=hackutd").every((t) => /hackathon/i.test(t))).toBe(true);
    const week = queryFixtureCompetitions(
      { ...q("from=2026-11-10&to=2026-11-17"), limit: 50 },
      now,
    ).items;
    for (const i of week) {
      const t = new Date(i.next_stage!.deadline_at).getTime();
      expect(t).toBeGreaterThanOrEqual(new Date("2026-11-10T00:00:00-06:00").getTime());
      expect(t).toBeLessThanOrEqual(new Date("2026-11-17T23:59:59-05:00").getTime());
    }
  });

  it("pages with an opaque cursor and never repeats an item", () => {
    const first = queryFixtureCompetitions({ ...q(), limit: 5 }, now);
    expect(first.items).toHaveLength(5);
    expect(first.next_cursor).not.toBeNull();
    const second = queryFixtureCompetitions({ ...q(), limit: 5, cursor: first.next_cursor! }, now);
    const seen = new Set(first.items.map((i) => i.id));
    for (const i of second.items) expect(seen.has(i.id)).toBe(false);
  });

  it("produces cards that satisfy the shared schema (valid uuids and enums)", () => {
    for (const item of queryFixtureCompetitions({ ...q("include_past=1"), limit: 50 }, now).items) {
      expect(gameCardDtoSchema.safeParse(item).success, item.slug).toBe(true);
    }
  });
});

describe("fixture Game Day", () => {
  it("returns a schema-valid DTO with ordered stages, and null for unknown slugs", () => {
    const dto = getFixtureGameDay("comet-case-competition", now)!;
    expect(gameDayDtoSchema.safeParse(dto).success).toBe(true);
    expect(dto.stages.map((s) => s.order)).toEqual([1, 2, 3, 4]);
    expect(dto.eligibility?.majors).toContain("Accounting");
    expect(getFixtureGameDay("nope", now)).toBeNull();
  });
});
