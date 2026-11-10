import { describe, expect, it } from "vitest";
import { ogTitleFontSize } from "@/lib/og";

describe("ogTitleFontSize", () => {
  it("shrinks monotonically as titles get longer and never gets unreadably small", () => {
    const sizes = [10, 24, 25, 40, 41, 64, 65, 200].map((n) => ogTitleFontSize("x".repeat(n)));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(48);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(110);
  });
});
