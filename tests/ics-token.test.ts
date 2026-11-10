import { describe, expect, it } from "vitest";
import { ICS_TOKEN_PATTERN, generateIcsToken, icsFeedPath, icsFeedUrl } from "@/lib/ics-token";

describe("ics token", () => {
  it("generates 192-bit hex tokens that never repeat", () => {
    const tokens = new Set(Array.from({ length: 500 }, generateIcsToken));
    expect(tokens.size).toBe(500);
    for (const t of tokens) expect(t).toMatch(ICS_TOKEN_PATTERN);
  });

  it("builds feed URLs without double slashes", () => {
    const t = "a".repeat(48);
    expect(icsFeedPath(t)).toBe(`/api/calendar/${t}.ics`);
    expect(icsFeedUrl("https://cometarena.example/", t)).toBe(
      `https://cometarena.example/api/calendar/${t}.ics`,
    );
    expect(icsFeedUrl("http://localhost:3000", t)).toBe(
      `http://localhost:3000/api/calendar/${t}.ics`,
    );
  });

  it("DB default tokens (24 random bytes hex) match the same pattern", () => {
    expect("0123456789abcdef".repeat(3)).toMatch(ICS_TOKEN_PATTERN);
  });
});
