import { describe, expect, it } from "vitest";
import {
  normalizeResult,
  officerEditSchema,
  officerErrorStatus,
  parseResultsCsv,
} from "@/lib/office";

describe("officerEditSchema", () => {
  it("accepts a partial edit and rejects an empty one", () => {
    expect(officerEditSchema.safeParse({ prize: "$500" }).success).toBe(true);
    expect(officerEditSchema.safeParse({}).success).toBe(false);
  });
  it("validates field shapes", () => {
    expect(officerEditSchema.safeParse({ title: "x" }).success).toBe(false);
    expect(officerEditSchema.safeParse({ register_url: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(officerEditSchema.safeParse({ register_url: null }).success).toBe(true);
    expect(
      officerEditSchema.safeParse({ cost: "free", format: "hybrid", categories: ["hackathon"] })
        .success,
    ).toBe(true);
    expect(officerEditSchema.safeParse({ categories: [] }).success).toBe(false);
    expect(
      officerEditSchema.safeParse({ stages: [{ name: "Reg", deadline_at: "tomorrow" }] }).success,
    ).toBe(false);
    expect(
      officerEditSchema.safeParse({
        stages: [{ name: "Reg", deadline_at: "2026-12-01T23:59:00-06:00" }],
      }).success,
    ).toBe(true);
  });
});

describe("normalizeResult", () => {
  it.each([
    ["1st", "first"],
    ["Winner", "first"],
    [" 2ND ", "second"],
    ["3", "third"],
    ["Finalist", "finalist"],
    ["participant", "participated"],
  ])("%s -> %s", (i, o) => expect(normalizeResult(i)).toBe(o));
  it("rejects unknown words", () => expect(normalizeResult("champion")).toBeNull());
});

describe("parseResultsCsv", () => {
  it("parses rows with optional rounds, points and team, with or without a header", () => {
    const a = parseResultsCsv(
      "email,result,rounds,points,team\nA@utdallas.edu,1st,3,100,Team Alpha\nb@utdallas.edu,finalist",
    );
    expect(a.skipped).toEqual([]);
    expect(a.rows).toEqual([
      {
        email: "A@utdallas.edu",
        result: "first",
        rounds_advanced: 3,
        points: 100,
        team_name: "Team Alpha",
      },
      {
        email: "b@utdallas.edu",
        result: "finalist",
        rounds_advanced: undefined,
        points: undefined,
        team_name: undefined,
      },
    ]);
    expect(parseResultsCsv("a@utdallas.edu,2nd").rows).toHaveLength(1);
  });
  it("reports every bad row with its line and keeps the good ones", () => {
    const r = parseResultsCsv(
      "email,result\nnot-an-email,1st\na@utdallas.edu,champion\nb@utdallas.edu,1st,x\nc@utdallas.edu,1st,2,abc\nd@utdallas.edu,3rd\nD@utdallas.edu,2nd",
    );
    expect(r.rows.map((x) => x.email)).toEqual(["d@utdallas.edu"]);
    expect(r.skipped.map((s) => [s.line, s.reason.split(" ")[0]])).toEqual([
      [2, "Not"],
      [3, "Result"],
      [4, "Rounds"],
      [5, "Points"],
      [7, "This"],
    ]);
  });
  it("empty input is a no-op and oversized input is refused", () => {
    expect(parseResultsCsv("")).toEqual({ rows: [], skipped: [] });
    const big = Array.from({ length: 1002 }, (_, i) => `u${i}@utdallas.edu,1st`).join("\n");
    expect(parseResultsCsv(big).skipped[0].reason).toMatch(/Too many rows/);
  });
});

describe("officerErrorStatus", () => {
  it("maps SQLSTATEs", () => {
    expect(officerErrorStatus("42501").status).toBe(403);
    expect(officerErrorStatus("22P02").status).toBe(422);
    expect(officerErrorStatus("XX000").status).toBe(503);
  });
});
