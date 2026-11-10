import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkComposition, evalCaseSchema, parseEvalCases } from "@/lib/eval/schema";

const good = {
  id: "ais-abc",
  source_url: "https://www.instagram.com/p/ABC/",
  org: "ais",
  posted_at: "2026-11-03T15:00:00-06:00",
  caption: "hi",
  images: [],
  label: {
    kind: "competition",
    title: "AIS Case",
    host: "AIS",
    categories: ["case_competition"],
    first_deadline: "2026-11-20T23:59:00-06:00",
    register_url: "https://x.example/r",
  },
};

describe("eval case schema", () => {
  it("accepts a complete case", () => expect(evalCaseSchema.safeParse(good).success).toBe(true));

  it("the committed seed set validates, with unique ids", () => {
    const { cases, issues } = parseEvalCases(readFileSync("eval/cases.jsonl", "utf8"));
    expect(issues).toEqual([]);
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  it("rejects a competition with no title, and a non-competition with a deadline", () => {
    expect(
      evalCaseSchema.safeParse({ ...good, label: { ...good.label, title: null } }).success,
    ).toBe(false);
    expect(
      evalCaseSchema.safeParse({
        ...good,
        label: { ...good.label, kind: "not_competition", title: null },
      }).success,
    ).toBe(false);
    expect(
      evalCaseSchema.safeParse({
        ...good,
        label: {
          kind: "not_competition",
          title: null,
          host: null,
          categories: [],
          first_deadline: null,
          register_url: null,
        },
      }).success,
    ).toBe(true);
  });

  it("rejects a deadline without a UTC offset, a bad id and an unknown category", () => {
    expect(
      evalCaseSchema.safeParse({
        ...good,
        label: { ...good.label, first_deadline: "2026-11-20T23:59:00" },
      }).success,
    ).toBe(false);
    expect(evalCaseSchema.safeParse({ ...good, id: "Bad Id" }).success).toBe(false);
    expect(
      evalCaseSchema.safeParse({ ...good, label: { ...good.label, categories: ["nonsense"] } })
        .success,
    ).toBe(false);
  });

  it("parseEvalCases reports every problem with its line, skips comments/blank lines and flags duplicates", () => {
    const text = [
      JSON.stringify(good),
      "",
      "// a comment",
      "{not json",
      JSON.stringify({ ...good, id: "x", org: "" }),
      JSON.stringify(good),
    ].join("\n");
    const { cases, issues } = parseEvalCases(text);
    expect(cases).toHaveLength(1);
    expect(issues.map((i) => [i.line, i.message.split(":")[0]])).toEqual([
      [4, "Not valid JSON"],
      [5, "org"],
      [6, "Duplicate id"],
    ]);
  });

  it("strict composition needs 50 cases, 10 non-competitions and 5 results", () => {
    const { cases } = parseEvalCases(readFileSync("eval/cases.jsonl", "utf8"));
    expect(checkComposition(cases).length).toBeGreaterThan(0);
    const many = Array.from({ length: 50 }, (_, i) => ({
      ...good,
      id: `c${i}`,
      label:
        i < 10
          ? {
              kind: "not_competition",
              title: null,
              host: null,
              categories: [],
              first_deadline: null,
              register_url: null,
            }
          : i < 15
            ? { ...good.label, kind: "results", first_deadline: null, register_url: null }
            : good.label,
    }));
    expect(checkComposition(many.map((c) => evalCaseSchema.parse(c)))).toEqual([]);
  });
});
