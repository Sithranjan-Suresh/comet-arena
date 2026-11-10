import { describe, expect, it } from "vitest";
import { countdownParts } from "@/lib/countdown";

const now = new Date("2026-11-10T12:00:00Z");
const at = (ms: number) => new Date(now.getTime() + ms);
const M = 60_000;
const H = 60 * M;
const D = 24 * H;

describe("countdownParts", () => {
  it("formats more than a day with days, hours and minutes", () => {
    const p = countdownParts(at(3 * D + 4 * H + 12 * M), now);
    expect(p).toMatchObject({
      state: "open",
      days: 3,
      hours: 4,
      minutes: 12,
      digits: "03d 04h 12m",
    });
    expect(p.spoken).toBe("3 days 4 hours until deadline");
  });

  it("uses singular units", () => {
    expect(countdownParts(at(1 * D + 1 * H), now).spoken).toBe("1 day 1 hour until deadline");
  });

  it("drops days when under 24 hours", () => {
    const p = countdownParts(at(4 * H + 12 * M), now);
    expect(p.digits).toBe("04h 12m");
    expect(p.spoken).toBe("4 hours 12 minutes until deadline");
  });

  it("shows only minutes when under an hour", () => {
    const p = countdownParts(at(12 * M), now);
    expect(p.digits).toBe("12m");
    expect(p.spoken).toBe("12 minutes until deadline");
  });

  it("handles the final minute", () => {
    expect(countdownParts(at(30_000), now)).toMatchObject({ digits: "<1m", state: "open" });
  });

  it("reports closed at and after the deadline, and for invalid dates", () => {
    expect(countdownParts(now, now).state).toBe("closed");
    expect(countdownParts(at(-5 * D), now)).toMatchObject({
      state: "closed",
      spoken: "Deadline has passed",
    });
    expect(countdownParts("garbage", now).state).toBe("closed");
  });

  it("accepts ISO strings", () => {
    expect(countdownParts("2026-11-10T13:00:00Z", now).digits).toBe("01h 00m");
  });
});
