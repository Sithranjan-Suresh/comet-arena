import { describe, expect, it } from "vitest";
import { checkGate } from "@/lib/eval/gate";

const good = {
  first_deadline: 0.9,
  title: 0.9,
  is_competition_recall: 0.95,
  is_competition_precision: 0.95,
};

describe("eval gate", () => {
  it("passes when nothing regressed and minimums are met", () => {
    expect(checkGate({ current: good, baseline: good, absolute: true })).toEqual({
      ok: true,
      failures: [],
    });
  });
  it("fails on a regression beyond the tolerance, passes within it", () => {
    expect(
      checkGate({ current: { ...good, title: 0.86 }, baseline: good, absolute: false }).failures[0],
    ).toMatch(/title: dropped from 90.0% to 86.0%/);
    expect(
      checkGate({ current: { ...good, title: 0.89 }, baseline: good, absolute: false }).ok,
    ).toBe(true);
  });
  it("absolute mode enforces the spec minimums even with no baseline", () => {
    const o = checkGate({
      current: { ...good, first_deadline: 0.7 },
      baseline: null,
      absolute: true,
    });
    expect(o.ok).toBe(false);
    expect(o.failures[0]).toMatch(/first_deadline: 70.0% is below the 85% minimum/);
    expect(
      checkGate({ current: { ...good, first_deadline: 0.7 }, baseline: null, absolute: false }).ok,
    ).toBe(true);
  });
  it("a missing metric fails", () => {
    expect(
      checkGate({ current: { ...good, title: null }, baseline: good, absolute: false }).failures,
    ).toContain("title: no result");
  });
});
