import { describe, expect, it } from "vitest";
import {
  nextOccurrenceYear,
  parseModelTimestamp,
  postProcessExtraction,
} from "@/lib/extract/postprocess";
import { type Extraction, extractionSchema } from "@/lib/schemas";

const base = (over: Partial<Extraction> = {}): Extraction =>
  extractionSchema.parse({
    is_competition: true,
    kind: "competition",
    title: "T",
    confidence: 0.9,
    stages: [],
    ...over,
  });
const stage = (name: string, deadline: string, starts: string | null = null) => ({
  name,
  starts_at: starts,
  deadline_at: deadline,
});
const run = (ex: Extraction, postedAt?: string) =>
  postProcessExtraction(ex, { postedAt, now: new Date("2026-11-10T15:00:00Z") });

describe("nextOccurrenceYear", () => {
  it("returns this year when the date is still ahead and next year when it has passed", () => {
    expect(nextOccurrenceYear(12, 4, new Date("2026-11-02T12:00:00Z"))).toBe(2026);
    expect(nextOccurrenceYear(1, 15, new Date("2026-12-20T12:00:00Z"))).toBe(2027);
  });

  it("counts the post day itself as still upcoming", () => {
    expect(nextOccurrenceYear(12, 31, new Date("2026-12-31T12:00:00Z"))).toBe(2026);
  });

  it("finds the next leap year for Feb 29", () => {
    expect(nextOccurrenceYear(2, 29, new Date("2027-01-10T12:00:00Z"))).toBe(2028);
  });
});

describe("postProcessExtraction: years", () => {
  it("infers 2026 for 'Dec 4-5' posted Nov 2 (range stays together)", () => {
    const ex = base({
      missing_fields: ["year"],
      // model guessed 2025 (wrong)
      stages: [stage("Hack", "2025-12-05T17:00:00-06:00", "2025-12-04T18:00:00-06:00")],
    });
    const r = run(ex, "2026-11-02T14:00:00Z");
    expect(r.yearInferred).toBe(true);
    expect(r.extraction.stages[0]).toMatchObject({
      starts_at: "2026-12-05T00:00:00.000Z",
      deadline_at: "2026-12-05T23:00:00.000Z",
    });
    expect(r.adjustments.join()).toContain("year set to 2026");
  });

  it("rolls into next year when the date has already passed this year", () => {
    const ex = base({
      missing_fields: ["year"],
      stages: [stage("Apps close", "2026-01-15T23:59:00-06:00")],
    });
    const r = run(ex, "2026-12-20T14:00:00Z");
    expect(r.extraction.stages[0].deadline_at).toBe("2027-01-16T05:59:00.000Z");
  });

  it("keeps later stages after earlier ones across a year boundary", () => {
    const ex = base({
      missing_fields: ["year"],
      stages: [
        stage("Reg", "2026-12-20T23:59:00-06:00"),
        stage("Finals", "2026-01-10T17:00:00-06:00"),
      ],
    });
    const r = run(ex, "2026-12-01T14:00:00Z");
    expect(r.extraction.stages.map((s) => s.name)).toEqual(["Reg", "Finals"]);
    expect(r.extraction.stages[1].deadline_at.startsWith("2027-01-10")).toBe(true);
  });

  it("does not touch explicit years (no 'year' in missing_fields)", () => {
    const ex = base({ stages: [stage("Final", "2028-03-01T17:00:00-06:00")] });
    const r = run(ex, "2026-11-02T14:00:00Z");
    expect(r.yearInferred).toBe(false);
    expect(r.extraction.stages[0].deadline_at).toBe("2028-03-01T23:00:00.000Z");
  });

  it("does not move an already-closed registration when the year is explicit", () => {
    const ex = base({ stages: [stage("Reg closed", "2026-10-30T23:59:00-05:00")] });
    expect(
      run(ex, "2026-11-02T14:00:00Z").extraction.stages[0].deadline_at.startsWith("2026-10-31"),
    ).toBe(true);
  });

  it("handles spring-forward dates (March 2027 is CDT)", () => {
    const ex = base({
      missing_fields: ["year"],
      stages: [stage("Final", "2026-03-20T17:00:00-06:00")],
    });
    const r = run(ex, "2026-12-01T14:00:00Z");
    // Mar 20 2027 17:00 CDT (UTC-5) = 22:00Z
    expect(r.extraction.stages[0].deadline_at).toBe("2027-03-20T22:00:00.000Z");
  });
});

describe("parseModelTimestamp", () => {
  it("applies the real Chicago offset when the model wrote the wrong Central offset", () => {
    // March 20 is CDT (UTC-5); the model wrote -06:00 but meant 17:00 local.
    expect(parseModelTimestamp("2027-03-20T17:00:00-06:00")?.toISOString()).toBe(
      "2027-03-20T22:00:00.000Z",
    );
    // November is CST (UTC-6); a -05:00 offset is corrected too.
    expect(parseModelTimestamp("2026-11-20T17:00:00-05:00")?.toISOString()).toBe(
      "2026-11-20T23:00:00.000Z",
    );
  });

  it("keeps explicit instants in other offsets and rejects impossible dates", () => {
    expect(parseModelTimestamp("2026-11-20T23:00:00Z")?.toISOString()).toBe(
      "2026-11-20T23:00:00.000Z",
    );
    expect(parseModelTimestamp("2026-11-20T10:00:00+01:00")?.toISOString()).toBe(
      "2026-11-20T09:00:00.000Z",
    );
    expect(parseModelTimestamp("2026-02-30T10:00:00-06:00")).toBeNull();
    expect(parseModelTimestamp("garbage")).toBeNull();
  });
});

describe("postProcessExtraction: ranges and clean-up", () => {
  it("turns a midnight (date-only) deadline into end of day", () => {
    const ex = base({ stages: [stage("Due", "2026-11-20T00:00:00-06:00")] });
    const r = run(ex);
    expect(r.extraction.stages[0].deadline_at).toBe("2026-11-21T05:59:00.000Z");
    expect(r.adjustments.join()).toContain("midnight");
  });

  it("swaps a reversed start/end", () => {
    const ex = base({
      stages: [stage("Hack", "2026-11-07T09:00:00-06:00", "2026-11-08T12:00:00-06:00")],
    });
    const s = run(ex).extraction.stages[0];
    expect(s.starts_at! < s.deadline_at).toBe(true);
  });

  it("drops invalid stages and exact duplicates, and sorts by deadline", () => {
    // Built without schema parsing: this is the defensive path for values that slip past validation.
    const ex = {
      ...base(),
      stages: [
        stage("Finals", "2026-12-05T17:00:00-06:00"),
        stage("Reg", "2026-11-20T23:59:00-06:00"),
        stage("Reg", "2026-11-20T23:59:00-06:00"),
        { name: "Bad", starts_at: null, deadline_at: "2026-13-45T00:00:00-06:00" },
        { name: "Feb30", starts_at: null, deadline_at: "2026-02-30T10:00:00-06:00" },
      ],
    };
    const r = run(ex);
    expect(r.extraction.stages.map((s) => s.name)).toEqual(["Reg", "Finals"]);
    expect(r.adjustments.join()).toMatch(/duplicate/);
    expect(r.adjustments.join()).toMatch(/invalid/);
  });

  it("returns recaps and non-competitions untouched", () => {
    const results = base({
      kind: "results",
      is_competition: false,
      missing_fields: ["year"],
      stages: [stage("x", "2020-01-01T00:00:00-06:00")],
    });
    expect(run(results).extraction).toEqual(results);
  });

  it("is idempotent", () => {
    const ex = base({
      missing_fields: ["year"],
      stages: [stage("Hack", "2025-12-05T17:00:00-06:00", "2025-12-04T18:00:00-06:00")],
    });
    const once = run(ex, "2026-11-02T14:00:00Z").extraction;
    const twice = run(once, "2026-11-02T14:00:00Z").extraction;
    expect(twice.stages).toEqual(once.stages);
  });
});
