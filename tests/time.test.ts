import { describe, expect, it } from "vitest";
import { daysUntil, formatCT, relativeUpdated } from "@/lib/time";

describe("formatCT", () => {
  it("formats in Central Time with a CT label", () => {
    expect(formatCT("2026-11-21T05:59:00Z")).toBe("Nov 20, 2026, 11:59 PM CT");
    expect(formatCT("2026-11-21T05:59:00Z", "time")).toBe("11:59 PM CT");
  });

  it("date styles carry no time zone label", () => {
    expect(formatCT("2026-11-21T05:59:00Z", "date")).toBe("Nov 20, 2026");
    expect(formatCT("2026-11-21T05:59:00Z", "weekday")).toBe("Fri, Nov 20");
  });

  it("is DST-aware: fall back (Nov 1 2026) and spring forward (Mar 8 2026)", () => {
    // 2026-11-01 06:30Z is 1:30 AM CST (after the clocks fell back); 05:30Z is 12:30 AM CDT.
    expect(formatCT("2026-11-01T05:30:00Z", "time")).toBe("12:30 AM CT");
    expect(formatCT("2026-11-01T07:30:00Z", "time")).toBe("1:30 AM CT");
    // 2026-03-08 07:59Z is 1:59 AM CST; 08:00Z is 3:00 AM CDT (2:xx never exists).
    expect(formatCT("2026-03-08T07:59:00Z", "time")).toBe("1:59 AM CT");
    expect(formatCT("2026-03-08T08:00:00Z", "time")).toBe("3:00 AM CT");
  });

  it("converts across the date line correctly (UTC next day, Chicago same day)", () => {
    expect(formatCT("2026-07-05T03:00:00Z", "date")).toBe("Jul 4, 2026");
  });

  it("returns an empty string for invalid input", () => {
    expect(formatCT("not a date")).toBe("");
  });
});

describe("daysUntil", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("floors whole days and goes negative after the deadline", () => {
    expect(daysUntil("2026-11-17T12:00:00Z", now)).toBe(7);
    expect(daysUntil("2026-11-17T11:59:00Z", now)).toBe(6);
    expect(daysUntil("2026-11-09T12:00:00Z", now)).toBe(-1);
  });
});

describe("relativeUpdated", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it.each([
    ["2026-11-10T08:00:00Z", "updated today"],
    ["2026-11-09T11:00:00Z", "updated 1 day ago"],
    ["2026-11-07T12:00:00Z", "updated 3 days ago"],
    ["2026-10-20T12:00:00Z", "updated 3 weeks ago"],
    ["2026-07-10T12:00:00Z", "updated 4 months ago"],
    ["2026-11-11T12:00:00Z", "updated today"], // clock skew: never negative
  ])("%s -> %s", (iso, expected) => expect(relativeUpdated(iso, now)).toBe(expected));
});
