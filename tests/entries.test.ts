import { describe, expect, it } from "vitest";
import { deleteEntry, listEntries, patchEntry, seasonFor, upsertEntry } from "@/lib/entries";

const U = "00000000-0000-4000-8000-0000000000a1";
const C = "00000000-0000-4000-8000-0000000000c1";

describe("seasonFor", () => {
  it.each([
    ["2026-01-15T18:00:00Z", "Spring 2026"],
    ["2026-05-31T12:00:00Z", "Spring 2026"],
    ["2026-06-01T12:00:00Z", "Summer 2026"],
    ["2026-08-31T12:00:00Z", "Summer 2026"],
    ["2026-09-01T12:00:00Z", "Fall 2026"],
    ["2026-12-31T12:00:00Z", "Fall 2026"],
  ])("%s -> %s", (iso, season) => expect(seasonFor(new Date(iso))).toBe(season));

  it("uses Chicago time at the year boundary", () => {
    // 2027-01-01 03:00Z is still Dec 31 2026 in Chicago -> Fall 2026
    expect(seasonFor(new Date("2027-01-01T03:00:00Z"))).toBe("Fall 2026");
    expect(seasonFor(new Date("2027-01-01T07:00:00Z"))).toBe("Spring 2027");
  });
});

type Call = [string, unknown[]];
function fake(
  opts: {
    comp?: unknown;
    row?: unknown;
    list?: unknown[];
    deleted?: unknown[];
    error?: unknown;
  } = {},
) {
  const calls: Call[] = [];
  const mk = (table: string) => {
    const b: Record<string, unknown> = {};
    const rec =
      (n: string) =>
      (...a: unknown[]) => (calls.push([`${table}.${n}`, a]), b);
    for (const m of ["select", "eq", "upsert", "update", "delete"]) b[m] = rec(m);
    b.order = async (...a: unknown[]) => (
      calls.push([`${table}.order`, a]),
      { data: opts.list ?? [], error: opts.error ?? null }
    );
    b.maybeSingle = async () => ({
      data:
        table === "competitions"
          ? opts.comp === undefined
            ? { id: C, stages: [] }
            : opts.comp
          : (opts.row ?? null),
      error: opts.error ?? null,
    });
    b.single = async () => ({ data: opts.row ?? null, error: opts.error ?? null });
    b.then = (res: (v: unknown) => unknown) =>
      res({ data: opts.deleted ?? [], error: opts.error ?? null });
    return b;
  };
  return { db: { from: (t: string) => mk(t) } as never, calls };
}
const row = {
  id: "e1",
  competition_id: C,
  team_name: "T",
  result: "second",
  rounds_advanced: 2,
  verified_by_host: false,
  points: null,
  season: "Fall 2026",
  created_at: "x",
  competition: [{ slug: "s", title: "S" }],
};

describe("upsertEntry", () => {
  const input = {
    competition_id: C,
    team_name: "T",
    result: "second" as const,
    rounds_advanced: 2,
  };

  it("upserts one entry per (user, competition) with the season from the competition's last stage, never sending host-verification fields", async () => {
    const { db, calls } = fake({
      comp: {
        id: C,
        stages: [{ deadline_at: "2026-10-01T00:00:00Z" }, { deadline_at: "2026-12-05T23:00:00Z" }],
      },
      row,
    });
    const r = await upsertEntry(db, U, input, new Date("2027-03-01T00:00:00Z"));
    expect(r.ok && r.entry.competition).toEqual({ slug: "s", title: "S" }); // relation array normalized
    const [, [payload, opts]] = calls.find(([n]) => n === "entries.upsert")!;
    expect(payload).toEqual({
      user_id: U,
      competition_id: C,
      team_name: "T",
      result: "second",
      rounds_advanced: 2,
      season: "Fall 2026",
    });
    expect(payload).not.toHaveProperty("verified_by_host");
    expect(payload).not.toHaveProperty("points");
    expect(opts).toEqual({ onConflict: "user_id,competition_id" });
  });

  it("falls back to the current season for undated competitions", async () => {
    const { db, calls } = fake({ row });
    await upsertEntry(db, U, input, new Date("2026-02-01T18:00:00Z"));
    expect((calls.find(([n]) => n === "entries.upsert")![1][0] as { season: string }).season).toBe(
      "Spring 2026",
    );
  });

  it("reports unknown competitions and database failures", async () => {
    expect(await upsertEntry(fake({ comp: null }).db, U, input)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await upsertEntry(fake({ error: new Error("db") }).db, U, input)).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("list / patch / delete", () => {
  it("lists newest first and returns null on failure", async () => {
    const { db, calls } = fake({ list: [row] });
    expect((await listEntries(db, U))![0].id).toBe("e1");
    expect(calls).toContainEqual(["entries.order", ["created_at", { ascending: false }]]);
    expect(await listEntries(fake({ error: new Error("x") }).db, U)).toBeNull();
  });

  it("patch and delete are scoped to the owner and 404 for someone else's entry", async () => {
    const { db, calls } = fake({ row });
    expect((await patchEntry(db, U, "e1", { result: "first" })).ok).toBe(true);
    expect(calls.filter(([n]) => n === "entries.eq").map(([, a]) => a)).toEqual([
      ["id", "e1"],
      ["user_id", U],
    ]);
    expect(await patchEntry(fake({ row: null }).db, U, "x", { result: "first" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await patchEntry(db, U, "e1", {})).toEqual({ ok: false, reason: "failed" });
    expect(await deleteEntry(fake({ deleted: [{ id: "e1" }] }).db, U, "e1")).toEqual({
      ok: true,
      entry: true,
    });
    expect(await deleteEntry(fake({ deleted: [] }).db, U, "other")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
