import { describe, expect, it } from "vitest";
import { escapeIlike, queryCompetitions, toGameCard } from "@/lib/data/competitions";
import {
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  decodeCursor,
  encodeCursor,
  parseCompetitionQuery,
} from "@/lib/schemas/competition-query";

const parse = (qs: string) => parseCompetitionQuery(new URLSearchParams(qs));

describe("parseCompetitionQuery", () => {
  it("applies defaults", () => {
    const r = parse("");
    expect(r.success && r.data).toMatchObject({
      categories: [],
      include_past: false,
      limit: PAGE_SIZE_DEFAULT,
    });
  });

  it("accepts repeated and comma-separated categories, drops unknown ones and duplicates", () => {
    const r = parse(
      "categories=hackathon&categories=design,speaking&categories=nonsense&categories=hackathon",
    );
    expect(r.success && r.data.categories).toEqual(["hackathon", "design", "speaking"]);
  });

  it("parses booleans, enums and the deadline window", () => {
    const r = parse(
      "utd_only=1&beginner=false&include_past=true&format=virtual&cost=free&from=2026-11-01&to=2026-12-31",
    );
    expect(r.success && r.data).toMatchObject({
      utd_only: true,
      beginner: false,
      include_past: true,
      format: "virtual",
      cost: "free",
      from: "2026-11-01",
      to: "2026-12-31",
    });
  });

  it("rejects bad values instead of guessing", () => {
    for (const qs of [
      "format=banana",
      "cost=cheap",
      "from=11/01/2026",
      "limit=0",
      `limit=${PAGE_SIZE_MAX + 1}`,
      "utd_only=maybe",
    ]) {
      expect(parse(qs).success, qs).toBe(false);
    }
  });

  it("ignores empty parameters (a cleared filter in the URL)", () => {
    expect(parse("q=&format=&categories=").success).toBe(true);
  });

  it("trims and bounds the search text", () => {
    const r = parse("q=%20%20hack%20%20");
    expect(r.success && r.data.q).toBe("hack");
    expect(parse(`q=${"x".repeat(101)}`).success).toBe(false);
  });
});

describe("cursor", () => {
  it("round-trips and falls back to 0 for anything suspicious", () => {
    expect(decodeCursor(encodeCursor(40))).toBe(40);
    for (const bad of [
      undefined,
      "",
      "not-base64!!",
      Buffer.from('{"o":-1}').toString("base64url"),
      Buffer.from('{"o":"9"}').toString("base64url"),
      Buffer.from('{"o":1e9}').toString("base64url"),
    ]) {
      expect(decodeCursor(bad)).toBe(0);
    }
  });
});

describe("escapeIlike", () => {
  it("removes characters that could break out of the or() filter or act as wildcards", () => {
    const hostile = 'a),status.eq.rejected,(b%_*"\\';
    const out = escapeIlike(hostile);
    for (const ch of ["(", ")", ",", "%", "_", "*", '"', "\\"]) expect(out).not.toContain(ch);
    expect(escapeIlike("  case   comp ")).toBe("case comp");
  });
});

/** Recording stand-in for the supabase-js query builder. */
function fakeDb(rows: Record<string, unknown>[], error: unknown = null) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "in", "overlaps", "eq", "gte", "lte", "or", "order"]) {
    builder[m] = (...args: unknown[]) => (calls.push([m, args]), builder);
  }
  builder.range = (...args: unknown[]) => {
    calls.push(["range", args]);
    return Promise.resolve({ data: rows, error });
  };
  return { db: { from: (t: string) => (calls.push(["from", [t]]), builder) } as never, calls };
}
const base = parse("").success
  ? (parse("") as { data: import("@/lib/schemas/competition-query").CompetitionQuery }).data
  : (undefined as never);
const call = (calls: [string, unknown[]][], name: string) => calls.filter(([n]) => n === name);

const row = (i: number, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  slug: `comp-${i}`,
  title: `Comp ${i}`,
  host_name: "AIS",
  host_slug: "ais",
  categories: ["hackathon"],
  prize: "$1",
  status: "live",
  has_upcoming: true,
  next_stage_id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  next_stage_name: "Registration",
  next_stage_starts_at: null,
  next_stage_deadline_at: "2026-11-20T23:59:00Z",
  next_stage_order: 1,
  ...over,
});

describe("queryCompetitions", () => {
  it("hides past competitions by default and sorts by next upcoming deadline", async () => {
    const { db, calls } = fakeDb([row(1)]);
    await queryCompetitions(db, base);
    expect(call(calls, "from")[0][1]).toEqual(["competition_cards"]);
    expect(call(calls, "in")[0][1]).toEqual(["status", ["live", "unverified", "expected"]]);
    expect(call(calls, "order").map(([, a]) => (a as unknown[])[0])).toEqual([
      "has_upcoming",
      "next_stage_deadline_at",
      "id",
    ]);
    expect(call(calls, "order")[0][1]).toEqual([
      "has_upcoming",
      { ascending: false, nullsFirst: false },
    ]);
  });

  it("includes past competitions only when asked", async () => {
    const { db, calls } = fakeDb([]);
    await queryCompetitions(db, { ...base, include_past: true });
    expect(call(calls, "in")[0][1]).toEqual(["status", ["live", "unverified", "expected", "past"]]);
  });

  it("applies every filter", async () => {
    const { db, calls } = fakeDb([]);
    await queryCompetitions(db, {
      ...base,
      categories: ["hackathon", "design"],
      format: "virtual",
      cost: "free",
      utd_only: true,
      beginner: true,
      from: "2026-11-01",
      to: "2026-12-31",
    });
    expect(call(calls, "overlaps")[0][1]).toEqual(["categories", ["hackathon", "design"]]);
    expect(call(calls, "eq").map(([, a]) => a)).toEqual([
      ["format", "virtual"],
      ["cost", "free"],
      ["utd_only", true],
      ["beginner_friendly", true],
    ]);
    expect(call(calls, "gte")[0][1][0]).toBe("next_stage_deadline_at");
    expect(call(calls, "lte")[0][1][0]).toBe("next_stage_deadline_at");
  });

  it("searches title, host and description with a sanitized string", async () => {
    const { db, calls } = fakeDb([]);
    await queryCompetitions(db, { ...base, q: "case),status.eq.rejected" });
    const filter = call(calls, "or")[0][1][0] as string;
    expect(filter).toBe(
      "title.ilike.*case status.eq.rejected*,host_name.ilike.*case status.eq.rejected*,description.ilike.*case status.eq.rejected*",
    );
    expect(filter.split(",")).toHaveLength(3); // nothing smuggled in as an extra condition
  });

  it("filters by host slug or name", async () => {
    const { db, calls } = fakeDb([]);
    await queryCompetitions(db, { ...base, host: "HackUTD" });
    expect(call(calls, "or")[0][1][0]).toBe("host_slug.eq.hackutd,host_name.ilike.*HackUTD*");
  });

  it("pages with one extra row to detect more results", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => row(i + 1));
    const { db, calls } = fakeDb(rows);
    const page = await queryCompetitions(db, { ...base, limit: 2 });
    expect(call(calls, "range")[0][1]).toEqual([0, 2]);
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.next_cursor!)).toBe(2);

    const { db: db2, calls: calls2 } = fakeDb(rows.slice(0, 2));
    const last = await queryCompetitions(db2, { ...base, limit: 2, cursor: page.next_cursor! });
    expect(call(calls2, "range")[0][1]).toEqual([2, 4]);
    expect(last.next_cursor).toBeNull();
  });

  it("surfaces database errors to the caller", async () => {
    const { db } = fakeDb([], new Error("boom"));
    await expect(queryCompetitions(db, base)).rejects.toThrow("boom");
  });
});

describe("toGameCard", () => {
  it("maps a row and a null next stage", () => {
    expect(toGameCard(row(1) as never)).toMatchObject({
      slug: "comp-1",
      host_slug: "ais",
      next_stage: { name: "Registration", order: 1 },
    });
    const none = toGameCard(row(2, { next_stage_id: null, next_stage_deadline_at: null }) as never);
    expect(none.next_stage).toBeNull();
    expect(toGameCard(row(3, { categories: null }) as never).categories).toEqual([]);
  });
});
