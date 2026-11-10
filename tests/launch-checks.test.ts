import { describe, expect, it } from "vitest";
import {
  type CompetitionRow,
  REQUIRED_LIVE_ENV,
  TARGETS,
  evaluateLaunchCounts,
  missingEnv,
  summarize,
} from "@/lib/launch/checks";

const row = (
  status: CompetitionRow["status"],
  cat = "hackathon",
  over: Partial<CompetitionRow> = {},
): CompetitionRow => ({ status, categories: [cat], source_count: 1, has_stages: true, ...over });
const many = (n: number, status: CompetitionRow["status"], cats: string[]) =>
  Array.from({ length: n }, (_, i) => row(status, cats[i % cats.length]));
const CATS = ["hackathon", "case_competition", "pitch_competition", "research", "design"];

describe("evaluateLaunchCounts", () => {
  it("passes with 40 listed, 50 past/expected, 5 categories, sources and dates", () => {
    const r = evaluateLaunchCounts([
      ...many(30, "live", CATS),
      ...many(10, "unverified", CATS),
      ...many(35, "past", CATS),
      ...many(15, "expected", CATS),
    ]);
    expect(summarize(r)).toEqual({ ok: true, failed: [] });
  });
  it("counts unverified as live-listed, ignores rejected, and reports each shortfall", () => {
    const r = evaluateLaunchCounts([
      ...many(39, "live", CATS),
      ...many(60, "rejected", CATS),
      ...many(49, "past", CATS),
    ]);
    expect(
      r
        .filter((x) => !x.ok)
        .map((x) => x.id)
        .sort(),
    ).toEqual(["history", "live"]);
    expect(r.find((x) => x.id === "live")!.detail).toBe("39 listed (live + unverified)");
  });
  it("needs at least 5 distinct categories ('other' does not count)", () => {
    const r = evaluateLaunchCounts([
      ...many(40, "live", ["hackathon", "design", "other", "other"]),
      ...many(50, "past", ["hackathon"]),
    ]);
    expect(r.find((x) => x.id === "categories")!.ok).toBe(false);
    expect(r.find((x) => x.id === "categories")!.detail).toContain("2 categories");
  });
  it("flags listings with no source and live listings with no dates", () => {
    const r = evaluateLaunchCounts([
      row("live", "hackathon", { source_count: 0 }),
      row("unverified", "design", { has_stages: false }),
    ]);
    expect(r.find((x) => x.id === "sources")!.ok).toBe(false);
    expect(r.find((x) => x.id === "dates")!.ok).toBe(false);
  });
  it("targets match the product spec", () =>
    expect(TARGETS).toEqual({ live: 40, pastOrExpected: 50, categories: 5 }));
});

describe("missingEnv", () => {
  it("lists missing, blank and placeholder values", () => {
    const env = Object.fromEntries(REQUIRED_LIVE_ENV.map((k) => [k, "real-value"]));
    expect(missingEnv(env)).toEqual([]);
    expect(
      missingEnv({ ...env, GROQ_API_KEY: "", RESEND_API_KEY: "changeme", EMAIL_FROM: undefined }),
    ).toEqual(
      ["GROQ_API_KEY", "RESEND_API_KEY", "EMAIL_FROM"].sort(
        (a, b) => REQUIRED_LIVE_ENV.indexOf(a as never) - REQUIRED_LIVE_ENV.indexOf(b as never),
      ),
    );
  });
});
