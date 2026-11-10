import { describe, expect, it } from "vitest";
import { buildStageViews, stageWhen } from "@/lib/stages";

const now = new Date("2026-11-10T12:00:00Z");
const s = (name: string, deadline: string, starts: string | null = null, order?: number) => ({
  name,
  starts_at: starts,
  deadline_at: deadline,
  order,
});

describe("buildStageViews", () => {
  it("labels quarters, marks one next and the rest by time", () => {
    const v = buildStageViews(
      [
        s("Finals", "2026-12-05T23:00:00Z", null, 3),
        s("Registration", "2026-11-05T23:00:00Z", null, 1),
        s("Round 1", "2026-11-20T23:00:00Z", null, 2),
      ],
      now,
    );
    expect(v.map((x) => x.quarter)).toEqual(["Q1", "Q2", "Q3"]);
    expect(v.map((x) => x.state)).toEqual(["past", "next", "upcoming"]);
    expect(v.map((x) => x.stage.name)).toEqual(["Registration", "Round 1", "Finals"]);
  });

  it("has no next stage when everything is past, and all next when nothing is", () => {
    expect(buildStageViews([s("A", "2026-10-01T00:00:00Z")], now)[0].state).toBe("past");
    expect(buildStageViews([s("A", "2026-12-01T00:00:00Z")], now)[0].state).toBe("next");
  });

  it("falls back to deadline order when order is missing", () => {
    const v = buildStageViews(
      [s("Late", "2026-12-01T00:00:00Z"), s("Early", "2026-11-12T00:00:00Z")],
      now,
    );
    expect(v[0].stage.name).toBe("Early");
  });

  it("handles 1, 3 and 5 stages", () => {
    for (const n of [1, 3, 5]) {
      const stages = Array.from({ length: n }, (_, i) => s(`S${i}`, `2026-12-0${i + 1}T00:00:00Z`));
      const v = buildStageViews(stages, now);
      expect(v).toHaveLength(n);
      expect(v.filter((x) => x.state === "next")).toHaveLength(1);
    }
  });
});

describe("stageWhen", () => {
  it("shows a date range for multi-day stages (Nov 7–8)", () => {
    expect(stageWhen(s("Hack", "2026-11-09T05:59:00Z", "2026-11-07T15:00:00Z"))).toBe(
      "Nov 7, 2026 – Nov 8, 2026",
    );
  });

  it("shows the deadline with CT when there is no separate start or it is the same day", () => {
    expect(stageWhen(s("Reg", "2026-11-21T05:59:00Z"))).toBe("Nov 20, 2026, 11:59 PM CT");
    expect(stageWhen(s("Final", "2026-12-05T23:00:00Z", "2026-12-05T15:00:00Z"))).toBe(
      "Dec 5, 2026, 5:00 PM CT",
    );
  });
});
