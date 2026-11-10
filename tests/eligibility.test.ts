import { describe, expect, it } from "vitest";
import { ELIGIBILITY_LABEL, evaluateEligibility } from "@/lib/eligibility";

const rules = (
  over: Partial<{
    majors: string[];
    class_years: string[];
    course_prereqs: string[];
    cross_school: boolean;
  }> = {},
) => ({
  majors: [],
  class_years: [],
  course_prereqs: [],
  cross_school: false,
  ...over,
});
const me = { major: "Computer Science", class_year: "junior", courses: [] as string[] };

describe("evaluateEligibility", () => {
  it("open competitions qualify everyone, even with an empty profile", () => {
    expect(evaluateEligibility(rules(), me)).toBe("qualifies");
    expect(evaluateEligibility(rules(), { major: null, class_year: null })).toBe("qualifies");
    expect(evaluateEligibility(null, me)).toBe("qualifies");
  });

  it.each([
    [["Computer Science"], "Computer Science", "qualifies"],
    [["computer science"], "Computer Science (BS)", "qualifies"],
    [["Computer Science", "Data Science"], "Data Science", "qualifies"],
    [["Computer Science"], "CS", "qualifies"], // alias
    [["Computer Science"], "Finance", "check"],
    [["Business Administration"], "Business Admin", "qualifies"],
    [["Accounting"], "Accounting and Finance", "qualifies"], // contains
    [["Art"], "Computer Science", "check"], // short tokens never substring-match
  ])("major restriction %j vs %s -> %s", (majors, major, expected) => {
    expect(evaluateEligibility(rules({ majors }), { major, class_year: "junior" })).toBe(expected);
  });

  it("a missing major makes a major-restricted competition 'unknown', not a failure", () => {
    expect(
      evaluateEligibility(rules({ majors: ["Finance"] }), { major: null, class_year: "junior" }),
    ).toBe("unknown");
    expect(
      evaluateEligibility(rules({ majors: ["Finance"] }), { major: "  ", class_year: "junior" }),
    ).toBe("unknown");
  });

  it("cross-school competitions are open to every major", () => {
    expect(
      evaluateEligibility(rules({ majors: ["Finance"], cross_school: true }), {
        major: "Biology",
        class_year: null,
      }),
    ).toBe("qualifies");
  });

  it("class-year restrictions match case-insensitively and flag mismatches", () => {
    const r = rules({ class_years: ["junior", "senior", "graduate"] });
    expect(evaluateEligibility(r, { major: null, class_year: "Senior" })).toBe("qualifies");
    expect(evaluateEligibility(r, { major: null, class_year: "freshman" })).toBe("check");
    expect(evaluateEligibility(r, { major: null, class_year: null })).toBe("unknown");
  });

  it("a mismatch beats an unknown (we know enough to say check)", () => {
    const r = rules({ majors: ["Finance"], class_years: ["senior"] });
    expect(evaluateEligibility(r, { major: null, class_year: "freshman" })).toBe("check");
  });

  it("combines major and year: both must hold", () => {
    const r = rules({ majors: ["Computer Science"], class_years: ["junior"] });
    expect(evaluateEligibility(r, { major: "Computer Science", class_year: "junior" })).toBe(
      "qualifies",
    );
    expect(evaluateEligibility(r, { major: "Computer Science", class_year: "senior" })).toBe(
      "check",
    );
    expect(evaluateEligibility(r, { major: "Finance", class_year: "junior" })).toBe("check");
  });

  it("course prerequisites need course data; absent data is unknown, wrong data is check", () => {
    const r = rules({ course_prereqs: ["CS 2336"] });
    expect(evaluateEligibility(r, { ...me, courses: [] })).toBe("unknown");
    expect(evaluateEligibility(r, { ...me, courses: ["cs 2336", "cs 1337"] })).toBe("qualifies");
    expect(evaluateEligibility(r, { ...me, courses: ["MATH 2413"] })).toBe("check");
  });

  it("has a human label for every verdict", () => {
    expect(ELIGIBILITY_LABEL.qualifies).toBe("You qualify");
    expect(ELIGIBILITY_LABEL.check).toBe("Check eligibility");
    expect(ELIGIBILITY_LABEL.unknown.length).toBeGreaterThan(10);
  });
});
