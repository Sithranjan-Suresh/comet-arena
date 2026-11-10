import { describe, expect, it } from "vitest";
import { flattenSaves } from "@/lib/data/schedule";
import { type ScheduleStage, buildSchedule, stageWhenLine } from "@/lib/schedule";

const stage = (n: number, deadline: string, title = "Comp", name = `S${n}`): ScheduleStage => ({
  stage_id: `s${n}`,
  stage_name: name,
  starts_at: null,
  deadline_at: deadline,
  competition_id: "c1",
  slug: "comp",
  title,
  register_url: null,
});

// Tuesday Nov 10 2026, 9 AM Chicago. This week = Mon Nov 9 - Sun Nov 15.
const now = new Date("2026-11-10T15:00:00Z");

describe("buildSchedule", () => {
  it("groups upcoming stages by Monday-start week with friendly labels, soonest first", () => {
    const s = buildSchedule(
      [
        stage(1, "2026-12-01T17:00:00Z"), // week of Nov 30
        stage(2, "2026-11-12T23:59:00Z"), // this week
        stage(3, "2026-11-20T05:59:00Z"), // Fri Nov 20 CST 11:59 PM -> Nov 19 local? no: Nov 19 11:59PM CST; next week
        stage(4, "2026-11-22T12:00:00Z"), // Sun Nov 22 6 AM CST: still the week of Nov 16 (next week)
        stage(5, "2026-11-23T14:00:00Z"), // Mon Nov 23: week of Nov 23
      ],
      now,
    );
    expect(s.weeks.map((w) => [w.key, w.label, w.stages.map((x) => x.stage_id)])).toEqual([
      ["2026-11-09", "This week", ["s2"]],
      ["2026-11-16", "Next week", ["s3", "s4"]],
      ["2026-11-23", "Week of Nov 23", ["s5"]],
      ["2026-11-30", "Week of Nov 30", ["s1"]],
    ]);
  });

  it("puts a Sunday-night deadline in that week and a deadline just after midnight Monday in the next", () => {
    // Sun Nov 15 11:59 PM CST = Mon Nov 16 05:59Z -> still this week (Chicago date is Nov 15)
    // Mon Nov 16 12:01 AM CST = Mon Nov 16 06:01Z -> next week
    const s = buildSchedule(
      [stage(1, "2026-11-16T05:59:00Z"), stage(2, "2026-11-16T06:01:00Z")],
      now,
    );
    expect(s.weeks.map((w) => [w.label, w.stages.map((x) => x.stage_id)])).toEqual([
      ["This week", ["s1"]],
      ["Next week", ["s2"]],
    ]);
  });

  it("handles the daylight-saving change (fall back on Sun Nov 1 2026)", () => {
    const before = new Date("2026-10-28T15:00:00Z"); // Wed Oct 28
    const s = buildSchedule(
      [stage(1, "2026-11-01T11:00:00Z"), stage(2, "2026-11-02T06:30:00Z")],
      before,
    );
    // Nov 1 5 AM CST (Sunday, week of Oct 26) vs Nov 2 12:30 AM CST (Monday, week of Nov 2)
    expect(s.weeks.map((w) => [w.key, w.label])).toEqual([
      ["2026-10-26", "This week"],
      ["2026-11-02", "Next week"],
    ]);
  });

  it("separates past stages (most recent first) and counts a stage due right now as upcoming", () => {
    const s = buildSchedule(
      [
        stage(1, "2026-11-01T00:00:00Z"),
        stage(2, "2026-11-09T00:00:00Z"),
        stage(3, "2026-11-10T15:00:00Z"),
      ],
      now,
    );
    expect(s.past.map((x) => x.stage_id)).toEqual(["s2", "s1"]);
    expect(s.weeks[0].stages.map((x) => x.stage_id)).toEqual(["s3"]);
  });

  it("orders ties deterministically and ignores invalid dates", () => {
    const s = buildSchedule(
      [
        stage(1, "2026-11-12T20:00:00Z", "Zeta"),
        stage(2, "2026-11-12T20:00:00Z", "Alpha"),
        stage(3, "not a date"),
      ],
      now,
    );
    expect(s.weeks[0].stages.map((x) => x.title)).toEqual(["Alpha", "Zeta"]);
    expect(s.past).toEqual([]);
  });

  it("returns an empty schedule when nothing is saved", () => {
    expect(buildSchedule([], now)).toEqual({ weeks: [], past: [] });
  });
});

describe("stageWhenLine", () => {
  it("shows weekday, date and time in Central Time", () => {
    expect(stageWhenLine({ deadline_at: "2026-11-21T05:59:00Z" })).toBe("Fri, Nov 20, 11:59 PM CT");
  });
});

describe("flattenSaves", () => {
  it("flattens stages of saved competitions and skips rejected or missing ones", () => {
    const c = (status: string) => ({
      id: "c",
      slug: "s",
      title: "T",
      status,
      register_url: "u",
      stages: [{ id: "a", name: "R", starts_at: null, deadline_at: "2026-11-20T00:00:00Z" }],
    });
    expect(
      flattenSaves([
        { competition: c("live") },
        { competition: c("rejected") },
        { competition: null },
        { competition: { ...c("live"), stages: null } },
      ]),
    ).toHaveLength(1);
  });
});
