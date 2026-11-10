import { describe, expect, it } from "vitest";
import { summarizeHub } from "@/lib/data/free-agency-hub";

const NOW = new Date("2026-11-10T15:00:00Z");
const comp = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  slug: title.toLowerCase().replace(/\W+/g, "-"),
  title,
  status: "live",
  stages: [{ order: 1, deadline_at: "2026-12-01T00:00:00Z" }],
  ...over,
});

describe("summarizeHub", () => {
  it("lists my posts with open ones first, resolving to-one relations given as objects or arrays", () => {
    const hub = summarizeHub(
      [
        {
          id: "a1",
          roles: ["dev"],
          note: "n",
          status: "closed",
          competition: { slug: "alpha", title: "Alpha" },
        },
        {
          id: "a2",
          roles: ["design"],
          note: "",
          status: "open",
          competition: [{ slug: "beta", title: "Beta" }],
        },
      ],
      [
        {
          id: "o1",
          team_name: "Comet Coders",
          roles_needed: ["data"],
          note: "",
          status: "open",
          competition: { slug: "alpha", title: "Alpha" },
        },
      ],
      [],
      new Map(),
      new Map(),
      NOW,
    );
    expect(hub.myPosts.map((p) => `${p.kind}:${p.title}:${p.status}`)).toEqual([
      "opening:Alpha:open",
      "agent:Beta:open",
      "agent:Alpha:closed",
    ]);
    expect(hub.myPosts[0].teamName).toBe("Comet Coders");
  });

  it("skips posts whose competition is not visible", () => {
    expect(
      summarizeHub(
        [{ id: "a", roles: [], note: "", status: "open", competition: null }],
        [],
        [],
        new Map(),
        new Map(),
        NOW,
      ).myPosts,
    ).toEqual([]);
  });

  it("builds boards for saved competitions with counts, busiest first, and flags closed registration", () => {
    const quiet = comp("c1", "Quiet");
    const busy = comp("c2", "Busy");
    const closed = comp("c3", "Closed Reg", {
      stages: [{ order: 1, deadline_at: "2026-11-01T00:00:00Z" }],
    });
    const past = comp("c4", "Past One", { status: "past" });
    const rejected = comp("c5", "Gone", { status: "rejected" });
    const hub = summarizeHub(
      [],
      [],
      [
        { competition: quiet },
        { competition: busy },
        { competition: closed },
        { competition: past },
        { competition: rejected },
        { competition: null },
      ],
      new Map([
        ["c2", 3],
        ["c3", 1],
      ]),
      new Map([["c2", 2]]),
      NOW,
    );
    expect(hub.boards.map((b) => [b.title, b.agents, b.openings, b.registrationClosed])).toEqual([
      ["Busy", 3, 2, false],
      ["Closed Reg", 1, 0, true],
      ["Past One", 0, 0, true],
      ["Quiet", 0, 0, false],
    ]);
  });
});
