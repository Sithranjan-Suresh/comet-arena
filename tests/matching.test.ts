import { describe, expect, it } from "vitest";
import type { BoardFreeAgent, BoardOpening } from "@/lib/board";
import { roleFit, suggestAgents, suggestOpenings } from "@/lib/matching";

const opening = (id: string, needs: string[], over: Partial<BoardOpening> = {}): BoardOpening => ({
  id,
  team_name: `Team ${id}`,
  roles_needed: needs,
  note: "",
  created_at: "2026-11-10T10:00:00Z",
  display_name: "X",
  contact_email: null,
  is_mine: false,
  ...over,
});
const agent = (
  id: string,
  roles: string[],
  over: Partial<BoardFreeAgent> = {},
): BoardFreeAgent => ({
  id,
  roles,
  note: "",
  created_at: "2026-11-10T10:00:00Z",
  display_name: `Agent ${id}`,
  contact_email: null,
  is_mine: false,
  ...over,
});

describe("roleFit", () => {
  it("scores the share of needed roles covered, and lists the gaps", () => {
    expect(roleFit(["dev", "design"], ["dev", "pm"])).toEqual({
      overlap: ["dev"],
      missing: ["pm"],
      score: 0.5,
    });
    expect(roleFit(["dev"], ["dev"]).score).toBe(1);
    expect(roleFit(["dev"], ["design"]).score).toBe(0);
  });
  it("an opening that needs nothing matches no one, and duplicate roles are not double counted", () => {
    expect(roleFit(["dev"], []).score).toBe(0);
    expect(roleFit(["dev"], ["dev", "dev"]).score).toBe(1);
  });
});

describe("suggestOpenings", () => {
  it("ranks teams you cover most fully first, then more overlap, then newer", () => {
    const out = suggestOpenings(
      ["dev", "design"],
      [
        opening("half", ["dev", "pm"]),
        opening("full-old", ["dev"], { created_at: "2026-11-01T00:00:00Z" }),
        opening("full-new", ["dev"], { created_at: "2026-11-09T00:00:00Z" }),
        opening("double", ["dev", "design"]),
      ],
    );
    expect(out.map((s) => s.opening.id)).toEqual(["double", "full-new", "full-old", "half"]);
    expect(out[3].missing).toEqual(["pm"]);
  });
  it("leaves out your own openings, teams you cannot help, and respects the limit", () => {
    const out = suggestOpenings(
      ["dev"],
      [
        opening("mine", ["dev"], { is_mine: true }),
        opening("other-role", ["design"]),
        ...Array.from({ length: 8 }, (_, i) => opening(`o${i}`, ["dev"])),
      ],
      3,
    );
    expect(out).toHaveLength(3);
    expect(out.every((s) => s.opening.id.startsWith("o"))).toBe(true);
  });
  it("is deterministic when everything ties", () => {
    const a = suggestOpenings(["dev"], [opening("b", ["dev"]), opening("a", ["dev"])]);
    expect(a.map((s) => s.opening.id)).toEqual(["a", "b"]);
  });
});

describe("suggestAgents", () => {
  it("finds free agents who can fill a team's open roles, best cover first, excluding yourself", () => {
    const out = suggestAgents(
      ["dev", "design"],
      [
        agent("one", ["dev"]),
        agent("both", ["dev", "design"]),
        agent("none", ["pm"]),
        agent("me", ["dev", "design"], { is_mine: true }),
      ],
    );
    expect(out.map((s) => s.agent.id)).toEqual(["both", "one"]);
    expect(out[0].score).toBe(1);
    expect(out[1].missing).toEqual(["design"]);
  });
});
