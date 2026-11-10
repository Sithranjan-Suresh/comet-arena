import { describe, expect, it } from "vitest";
import { computeStats, statLine } from "@/lib/player-stats";

const e = (
  result: Parameters<typeof computeStats>[0][number]["result"],
  rounds = 0,
  verified = false,
) => ({ result, rounds_advanced: rounds, verified_by_host: verified });

describe("computeStats", () => {
  it("counts entered, advanced, podiums, wins and verified", () => {
    const s = computeStats([
      e("participated"),
      e("participated", 2),
      e("advanced"),
      e("finalist"),
      e("third", 1, true),
      e("second"),
      e("first", 3, true),
    ]);
    expect(s).toEqual({ entered: 7, advanced: 6, podiums: 3, wins: 1, verified: 2 });
  });
  it("treats participation with no rounds as not advanced", () => {
    expect(computeStats([e("participated")]).advanced).toBe(0);
  });
  it("handles an empty record", () => {
    expect(computeStats([])).toEqual({ entered: 0, advanced: 0, podiums: 0, wins: 0, verified: 0 });
  });
});

describe("statLine", () => {
  it("reads naturally and skips zero parts", () => {
    expect(statLine({ entered: 7, advanced: 3, podiums: 2, wins: 1, verified: 0 })).toBe(
      "7 entered · 3 advanced · 2 podiums · 1 win",
    );
    expect(statLine({ entered: 1, advanced: 0, podiums: 0, wins: 0, verified: 0 })).toBe(
      "1 entered",
    );
    expect(statLine({ entered: 0, advanced: 0, podiums: 0, wins: 0, verified: 0 })).toBe(
      "0 entered",
    );
  });
});
