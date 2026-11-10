import { describe, expect, it } from "vitest";
import { SLUG_PATTERN, getGameDay, toGameDay, type GameDayRow } from "@/lib/data/game-day";
import { gameDayDtoSchema } from "@/lib/schemas";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (over: Partial<GameDayRow> = {}): GameDayRow => ({
  id: id(1),
  slug: "ais-fall-case-competition",
  title: "AIS Fall Case Competition",
  host_name: "AIS",
  categories: ["case_competition", "finance"],
  description: "Solve a case.",
  tier: "campus",
  prize: "$2,500",
  cost: "free",
  format: "in_person",
  location: "JSOM",
  register_url: "https://example.com/r",
  utd_only: true,
  beginner_friendly: false,
  status: "unverified",
  confirmations: 2,
  flyer_url: null,
  updated_at: "2026-11-09T12:00:00Z",
  org: { slug: "ais" },
  stages: [
    { id: id(11), name: "Finals", starts_at: null, deadline_at: "2026-12-05T23:00:00Z", order: 2 },
    {
      id: id(10),
      name: "Registration",
      starts_at: null,
      deadline_at: "2026-11-21T05:59:00Z",
      order: 1,
    },
  ],
  eligibility: {
    majors: ["Accounting"],
    class_years: [],
    course_prereqs: [],
    team_min: 3,
    team_max: 4,
    cross_school: true,
  },
  sources: [
    { source: "instagram", source_url: "https://ig.example/p/2", seen_at: "2026-11-05T00:00:00Z" },
    { source: "instagram", source_url: "https://ig.example/p/1", seen_at: "2026-11-03T00:00:00Z" },
  ],
  ...over,
});

describe("toGameDay", () => {
  it("maps a row to a DTO that satisfies the shared schema", () => {
    const dto = toGameDay(row());
    expect(gameDayDtoSchema.safeParse(dto).success).toBe(true);
    expect(dto).toMatchObject({ host_slug: "ais", viewer_saved: false, viewer_eligible: null });
  });

  it("orders stages and sources", () => {
    const dto = toGameDay(row());
    expect(dto.stages.map((s) => s.name)).toEqual(["Registration", "Finals"]);
    expect(dto.sources.map((s) => s.source_url)).toEqual([
      "https://ig.example/p/1",
      "https://ig.example/p/2",
    ]);
  });

  it("accepts to-one relations as objects or arrays and tolerates missing relations", () => {
    expect(toGameDay(row({ org: [{ slug: "x" }] })).host_slug).toBe("x");
    const bare = toGameDay(row({ org: null, stages: null, eligibility: null, sources: null }));
    expect(bare).toMatchObject({ host_slug: null, stages: [], eligibility: null, sources: [] });
    const arr = toGameDay(
      row({
        eligibility: [
          {
            majors: [],
            class_years: [],
            course_prereqs: [],
            team_min: null,
            team_max: null,
            cross_school: false,
          },
        ],
      }),
    );
    expect(arr.eligibility?.cross_school).toBe(false);
  });
});

describe("getGameDay", () => {
  const dbReturning = (result: { data: unknown; error: unknown }) => {
    const seen: unknown[][] = [];
    const chain = {
      select: (s: string) => (seen.push(["select", s]), chain),
      eq: (...a: unknown[]) => (seen.push(["eq", ...a]), chain),
      maybeSingle: async () => result,
    };
    return { db: { from: (t: string) => (seen.push(["from", t]), chain) } as never, seen };
  };

  it("queries by slug and returns the mapped DTO", async () => {
    const { db, seen } = dbReturning({ data: row(), error: null });
    const dto = await getGameDay(db, "ais-fall-case-competition");
    expect(dto?.title).toBe("AIS Fall Case Competition");
    expect(seen).toContainEqual(["from", "competitions"]);
    expect(seen).toContainEqual(["eq", "slug", "ais-fall-case-competition"]);
    expect(String(seen.find((s) => s[0] === "select")![1])).toContain("stages(");
  });

  it("returns null when not found (or hidden by RLS) and throws on database errors", async () => {
    expect(await getGameDay(dbReturning({ data: null, error: null }).db, "nope")).toBeNull();
    await expect(
      getGameDay(dbReturning({ data: null, error: new Error("db down") }).db, "x"),
    ).rejects.toThrow("db down");
  });
});

describe("SLUG_PATTERN", () => {
  it.each(["ais-fall-case", "hack-2026", "a"])("accepts %s", (s) =>
    expect(SLUG_PATTERN.test(s)).toBe(true),
  );
  it.each(["", "Has Caps", "-lead", "trail-", "a--b", "a/b", "../etc", "a b", "é"])(
    "rejects %j",
    (s) => expect(SLUG_PATTERN.test(s)).toBe(false),
  );
});
