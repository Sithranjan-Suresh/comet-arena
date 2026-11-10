import { describe, expect, it } from "vitest";
import {
  MAX_OPEN_OPENINGS,
  createTeamOpening,
  patchFreeAgent,
  patchTeamOpening,
  registrationClosed,
  upsertFreeAgent,
} from "@/lib/free-agency";

const U = "00000000-0000-4000-8000-0000000000a1";
const C = "00000000-0000-4000-8000-0000000000c1";
const NOW = new Date("2026-11-10T15:00:00Z");
const future = "2026-12-01T00:00:00Z";
const past = "2026-11-01T00:00:00Z";

type Call = [string, unknown[]];
/** Fake query builder: records calls; `results` maps terminal call names to responses. */
function fake(
  opts: {
    competition?: unknown;
    openCount?: number;
    writeData?: unknown;
    writeError?: unknown;
    patchData?: unknown;
  } = {},
) {
  const calls: Call[] = [];
  const mk = (table: string) => {
    const b: Record<string, unknown> = {};
    const rec =
      (n: string) =>
      (...a: unknown[]) => (calls.push([`${table}.${n}`, a]), b);
    for (const m of ["select", "eq", "upsert", "insert", "update"]) b[m] = rec(m);
    b.maybeSingle = async () => {
      calls.push([`${table}.maybeSingle`, []]);
      return table === "competitions"
        ? { data: opts.competition ?? null, error: null }
        : { data: opts.patchData ?? null, error: null };
    };
    b.single = async () => (
      calls.push([`${table}.single`, []]),
      { data: opts.writeData ?? null, error: opts.writeError ?? null }
    );
    // count query: select(..., {head:true}).eq...  resolves when awaited
    b.then = (res: (v: unknown) => unknown) => res({ count: opts.openCount ?? 0, error: null });
    return b;
  };
  return { db: { from: (t: string) => (calls.push([`from`, [t]]), mk(t)) } as never, calls };
}
const comp = (stages: { order: number; deadline_at: string }[], status = "live") => ({
  id: C,
  status,
  stages,
});

describe("registrationClosed", () => {
  it("is closed once the FIRST stage has passed, whatever order the stages arrive in", () => {
    expect(
      registrationClosed(
        [
          { order: 2, deadline_at: future },
          { order: 1, deadline_at: past },
        ],
        NOW,
      ),
    ).toBe(true);
    expect(
      registrationClosed(
        [
          { order: 1, deadline_at: future },
          { order: 2, deadline_at: past },
        ],
        NOW,
      ),
    ).toBe(false);
  });
  it("is open when nothing is dated yet", () => expect(registrationClosed([], NOW)).toBe(false));
});

describe("upsertFreeAgent", () => {
  const input = { competition_id: C, roles: ["dev" as const], note: "Python, React" };

  it("upserts on (user, competition) as open, so re-posting reopens a closed post instead of failing", async () => {
    const row = {
      id: "fa1",
      competition_id: C,
      roles: ["dev"],
      note: "Python, React",
      status: "open",
    };
    const { db, calls } = fake({
      competition: comp([{ order: 1, deadline_at: future }]),
      writeData: row,
    });
    const r = await upsertFreeAgent(db, U, input, NOW);
    expect(r).toEqual({ ok: true, post: row });
    const up = calls.find(([n]) => n === "free_agents.upsert")!;
    expect(up[1][0]).toEqual({
      user_id: U,
      competition_id: C,
      roles: ["dev"],
      note: "Python, React",
      status: "open",
    });
    expect(up[1][1]).toEqual({ onConflict: "user_id,competition_id" });
  });

  it("refuses once registration has passed or the competition is past, and for unknown competitions", async () => {
    expect(
      await upsertFreeAgent(
        fake({ competition: comp([{ order: 1, deadline_at: past }]) }).db,
        U,
        input,
        NOW,
      ),
    ).toEqual({ ok: false, reason: "registration_closed" });
    expect(
      await upsertFreeAgent(
        fake({ competition: comp([{ order: 1, deadline_at: future }], "past") }).db,
        U,
        input,
        NOW,
      ),
    ).toEqual({ ok: false, reason: "registration_closed" });
    expect(await upsertFreeAgent(fake({ competition: null }).db, U, input, NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("reports a database failure", async () => {
    const { db } = fake({ competition: comp([]), writeError: { code: "XX" } });
    expect(await upsertFreeAgent(db, U, input, NOW)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("createTeamOpening", () => {
  const input = {
    competition_id: C,
    team_name: "Comet Coders",
    roles_needed: ["design" as const, "data" as const],
    note: "",
  };

  it("creates an opening for the signed-in user", async () => {
    const row = {
      id: "op1",
      competition_id: C,
      team_name: "Comet Coders",
      roles_needed: ["design", "data"],
      note: "",
      status: "open",
    };
    const { db, calls } = fake({ competition: comp([]), openCount: 1, writeData: row });
    expect(await createTeamOpening(db, U, input, NOW)).toEqual({ ok: true, post: row });
    expect(calls.find(([n]) => n === "team_openings.insert")![1][0]).toMatchObject({
      user_id: U,
      team_name: "Comet Coders",
    });
  });

  it(`caps open openings at ${MAX_OPEN_OPENINGS} per competition`, async () => {
    const { db, calls } = fake({ competition: comp([]), openCount: MAX_OPEN_OPENINGS });
    expect(await createTeamOpening(db, U, input, NOW)).toEqual({
      ok: false,
      reason: "limit_reached",
    });
    expect(calls.some(([n]) => n === "team_openings.insert")).toBe(false);
  });

  it("also closes after registration", async () => {
    expect(
      await createTeamOpening(
        fake({ competition: comp([{ order: 1, deadline_at: past }]) }).db,
        U,
        input,
        NOW,
      ),
    ).toEqual({ ok: false, reason: "registration_closed" });
  });
});

describe("patching your own posts", () => {
  it("scopes updates by id AND user, returning not_found for someone else's post", async () => {
    const { db, calls } = fake({
      patchData: { id: "fa1", competition_id: C, roles: ["dev"], note: "x", status: "closed" },
    });
    const ok = await patchFreeAgent(db, U, "fa1", { status: "closed" });
    expect(ok.ok).toBe(true);
    expect(calls.filter(([n]) => n === "free_agents.eq").map(([, a]) => a)).toEqual([
      ["id", "fa1"],
      ["user_id", U],
    ]);
    expect(await patchFreeAgent(fake({ patchData: null }).db, U, "other", { note: "x" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(
      await patchTeamOpening(fake({ patchData: null }).db, U, "other", { status: "closed" }),
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects an empty patch without touching the database", async () => {
    const { db, calls } = fake();
    expect(await patchFreeAgent(db, U, "fa1", {})).toEqual({ ok: false, reason: "failed" });
    expect(calls).toHaveLength(0);
  });
});
