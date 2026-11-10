import { describe, expect, it } from "vitest";
import { BOARD_LIMIT, getBoard } from "@/lib/board";

type Call = [string, unknown[]];
function fake(
  opts: { comp?: unknown; agents?: unknown[]; openings?: unknown[]; error?: unknown } = {},
) {
  const calls: Call[] = [];
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const rec =
      (n: string) =>
      (...a: unknown[]) => (calls.push([`${table}.${n}`, a]), b);
    for (const m of ["select", "eq", "contains", "order"]) b[m] = rec(m);
    b.maybeSingle = async () => ({
      data: opts.comp === undefined ? { id: "comp-1" } : opts.comp,
      error: null,
    });
    b.limit = async (...a: unknown[]) => (
      calls.push([`${table}.limit`, a]),
      {
        data: table === "board_free_agents" ? (opts.agents ?? []) : (opts.openings ?? []),
        error: opts.error ?? null,
      }
    );
    return b;
  };
  return { db: { from: (t: string) => builder(t) } as never, calls };
}

describe("getBoard", () => {
  it("returns free agents and openings for the competition, newest first, capped", async () => {
    const agents = [
      {
        id: "a1",
        roles: ["dev"],
        note: "",
        created_at: "2026-11-10",
        display_name: "Ada",
        contact_email: null,
        is_mine: false,
      },
    ];
    const { db, calls } = fake({ agents, openings: [] });
    const board = await getBoard(db, "ais-case");
    expect(board).toEqual({ free_agents: agents, openings: [] });
    expect(calls).toContainEqual(["board_free_agents.eq", ["competition_id", "comp-1"]]);
    expect(calls).toContainEqual([
      "board_team_openings.order",
      ["created_at", { ascending: false }],
    ]);
    expect(calls).toContainEqual(["board_free_agents.limit", [BOARD_LIMIT]]);
  });

  it("filters both lists by role when asked", async () => {
    const { db, calls } = fake();
    await getBoard(db, "ais-case", "design");
    expect(calls).toContainEqual(["board_free_agents.contains", ["roles", ["design"]]]);
    expect(calls).toContainEqual(["board_team_openings.contains", ["roles_needed", ["design"]]]);
  });

  it("does not filter without a role", async () => {
    const { db, calls } = fake();
    await getBoard(db, "ais-case");
    expect(calls.some(([n]) => n.endsWith(".contains"))).toBe(false);
  });

  it("returns null for an unknown competition and throws on database errors", async () => {
    expect(await getBoard(fake({ comp: null }).db, "nope")).toBeNull();
    await expect(getBoard(fake({ error: new Error("db") }).db, "ais-case")).rejects.toThrow("db");
  });

  it("passes through whatever the views return for contact_email (the database decides who sees it)", async () => {
    const row = {
      id: "a",
      roles: ["dev"],
      note: "",
      created_at: "x",
      display_name: "Ada",
      contact_email: "ada@utdallas.edu",
      is_mine: true,
    };
    const board = await getBoard(fake({ agents: [row] }).db, "s");
    expect(board!.free_agents[0].contact_email).toBe("ada@utdallas.edu");
  });
});
