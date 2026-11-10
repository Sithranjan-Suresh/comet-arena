import { describe, expect, it } from "vitest";
import { listSavedIds, saveCompetition, saveInputSchema, unsaveCompetition } from "@/lib/saves";

const U = "00000000-0000-4000-8000-0000000000a1";
const C = "00000000-0000-4000-8000-0000000000c1";

/** Fake supabase client recording calls; `result` is what every terminal call resolves to. */
function fake(result: { data?: unknown; error?: { code?: string } | null } = { error: null }) {
  const calls: [string, unknown[]][] = [];
  const chain: Record<string, unknown> = {};
  const rec =
    (name: string) =>
    (...args: unknown[]) => (calls.push([name, args]), chain);
  for (const m of ["from", "upsert", "delete", "select"]) chain[m] = rec(m);
  chain.eq = (...args: unknown[]) => (
    calls.push(["eq", args]),
    Object.assign(Promise.resolve({ error: null, ...result }), chain)
  );
  chain.then = undefined;
  const db = chain as never;
  // upsert and select(...) without eq resolve directly
  (chain as { upsert: unknown }).upsert = (...args: unknown[]) => (
    calls.push(["upsert", args]),
    Promise.resolve({ error: null, ...result })
  );
  (chain as { select: unknown }).select = (...args: unknown[]) => (
    calls.push(["select", args]),
    Object.assign(Promise.resolve({ error: null, ...result }), chain)
  );
  return { db, calls };
}

describe("saveInputSchema", () => {
  it("requires a UUID competition_id", () => {
    expect(saveInputSchema.safeParse({ competition_id: C }).success).toBe(true);
    for (const bad of [{}, { competition_id: "x" }, { competition_id: 5 }, null])
      expect(saveInputSchema.safeParse(bad).success).toBe(false);
  });
});

describe("saveCompetition", () => {
  it("upserts (user, competition) ignoring duplicates so saving twice is a no-op", async () => {
    const { db, calls } = fake();
    expect(await saveCompetition(db, U, C)).toEqual({ ok: true });
    expect(await saveCompetition(db, U, C)).toEqual({ ok: true });
    const [, [row, opts]] = calls.find(([n]) => n === "upsert")!;
    expect(row).toEqual({ user_id: U, competition_id: C });
    expect(opts).toEqual({ onConflict: "user_id,competition_id", ignoreDuplicates: true });
  });

  it("maps a foreign-key violation to not_found and other errors to failed", async () => {
    expect(await saveCompetition(fake({ error: { code: "23503" } }).db, U, C)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await saveCompetition(fake({ error: { code: "XX000" } }).db, U, C)).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("unsaveCompetition", () => {
  it("deletes only this user's row for this competition", async () => {
    const { db, calls } = fake();
    expect(await unsaveCompetition(db, U, C)).toEqual({ ok: true });
    expect(calls.filter(([n]) => n === "eq").map(([, a]) => a)).toEqual([
      ["user_id", U],
      ["competition_id", C],
    ]);
  });

  it("reports failures", async () => {
    expect(await unsaveCompetition(fake({ error: { code: "XX000" } }).db, U, C)).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("listSavedIds", () => {
  it("returns competition ids, or null when the query fails", async () => {
    expect(await listSavedIds(fake({ data: [{ competition_id: C }] }).db, U)).toEqual([C]);
    expect(await listSavedIds(fake({ data: null }).db, U)).toEqual([]);
    expect(await listSavedIds(fake({ error: { code: "x" } }).db, U)).toBeNull();
  });
});
