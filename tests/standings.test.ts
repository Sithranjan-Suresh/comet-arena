import { describe, expect, it, vi } from "vitest";
import { RESULT_POINTS, TIER_MULTIPLIER, entryPoints } from "@/lib/points";
import { type StandingRow, getStandings, headline, standingsQuerySchema } from "@/lib/standings";
import { parseResultsCsv } from "@/lib/office";

describe("points", () => {
  it("applies result base times tier, with host-supplied scores overriding", () => {
    expect(entryPoints("first")).toBe(10);
    expect(entryPoints("first", "national")).toBe(20);
    expect(entryPoints("second", "regional")).toBe(11); // 7 * 1.5 = 10.5 rounds up
    expect(entryPoints("third", "national", 42)).toBe(42);
    expect(RESULT_POINTS.participated).toBe(1);
    expect(TIER_MULTIPLIER.national).toBe(2);
  });
  it("mirrors the SQL formula (migration 25) numbers", async () => {
    const sql = (await import("node:fs")).readFileSync(
      "supabase/migrations/20261110000025_standings.sql",
      "utf8",
    );
    for (const [result, pts] of Object.entries(RESULT_POINTS))
      expect(sql).toMatch(new RegExp(`when '${result}' then ${pts}\\b|else ${pts}\\b`));
    expect(sql).toContain("then 2.0");
    expect(sql).toContain("then 1.5");
  });
});

describe("standingsQuerySchema", () => {
  it("defaults to clubs and falls back on junk instead of failing", () => {
    expect(standingsQuerySchema.parse({})).toEqual({ dimension: "org", season: undefined });
    expect(standingsQuerySchema.parse({ dimension: "student", season: "'; drop table" })).toEqual({
      dimension: "org",
      season: undefined,
    });
    expect(standingsQuerySchema.parse({ dimension: "major", season: "Fall 2026" })).toEqual({
      dimension: "major",
      season: "Fall 2026",
    });
  });
});

const row = (label: string, wins: number): StandingRow => ({
  key: label.toLowerCase(),
  label,
  points: 10,
  wins,
  podiums: wins,
  entries: wins,
  students: 2,
});
describe("headline", () => {
  it("says who won how many, per dimension and season", () => {
    expect(headline(row("AIS", 7), "org", "Fall 2026")).toBe(
      "AIS members won 7 competitions in Fall 2026.",
    );
    expect(headline(row("AIS", 1), "org")).toBe("AIS members won 1 competition so far.");
    expect(headline(row("Accounting", 3), "major")).toBe(
      "Accounting majors won 3 competitions so far.",
    );
    expect(headline(row("case_competition", 4), "category", "Fall 2026")).toBe(
      "4 case competition competitions have been won in Fall 2026.",
    );
  });
  it("says nothing when nobody has won or there are no rows", () => {
    expect(headline(row("AIS", 0), "org")).toBeNull();
    expect(headline(undefined, "org")).toBeNull();
  });
});

describe("getStandings", () => {
  const db = (
    s: { data?: unknown; error?: unknown },
    seasons: { data?: unknown; error?: unknown } = { data: [{ season: "Fall 2026" }] },
  ) =>
    ({
      rpc: vi.fn(async (name: string) =>
        name === "standings"
          ? { data: s.data ?? [], error: s.error ?? null }
          : { data: seasons.data ?? [], error: seasons.error ?? null },
      ),
    }) as never;

  it("maps numeric strings from Postgres bigint and lists seasons", async () => {
    const out = await getStandings(
      db({
        data: [
          {
            key: "k",
            label: "AIS",
            points: "37",
            wins: "2",
            podiums: "3",
            entries: "3",
            students: "2",
          },
        ],
      }),
      { dimension: "org" },
    );
    expect(out).toEqual({
      rows: [{ key: "k", label: "AIS", points: 37, wins: 2, podiums: 3, entries: 3, students: 2 }],
      seasons: ["Fall 2026"],
    });
  });
  it("returns null when the database errors", async () => {
    expect(await getStandings(db({ error: { message: "x" } }), { dimension: "org" })).toBeNull();
    expect(
      await getStandings(db({}, { error: { message: "x" } }), { dimension: "org" }),
    ).toBeNull();
  });
});

describe("results CSV with a club column", () => {
  it("carries the club to the upload", () => {
    const r = parseResultsCsv(
      "email,result,rounds,points,team,club\na@utdallas.edu,1st,2,,Team A,AIS",
    );
    expect(r.rows[0]).toMatchObject({
      result: "first",
      rounds_advanced: 2,
      team_name: "Team A",
      club: "AIS",
    });
  });
});

describe("fixtureStandings (mock mode)", () => {
  it("serves labeled sample rows for each dimension and an unknown season is empty", async () => {
    const { fixtureStandings } = await import("@/lib/standings");
    expect(fixtureStandings({ dimension: "org" }).rows[0].label).toContain("sample");
    expect(
      fixtureStandings({ dimension: "major", season: "Fall 2026" }).rows.length,
    ).toBeGreaterThan(0);
    expect(fixtureStandings({ dimension: "org", season: "Spring 2020" }).rows).toEqual([]);
  });
});
