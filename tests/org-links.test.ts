import { describe, expect, it } from "vitest";
import { discordUrl, instagramUrl } from "@/lib/orgs/links";

describe("instagramUrl", () => {
  it("builds a profile URL for plausible handles", () => {
    expect(instagramUrl("hackutd")).toBe("https://www.instagram.com/hackutd/");
    expect(instagramUrl("@AIS_UTD")).toBe("https://www.instagram.com/ais_utd/");
    expect(instagramUrl("some.club")).toBe("https://www.instagram.com/some.club/");
  });
  it("rejects anything that could escape the path", () => {
    for (const bad of [
      "../evil",
      "a/b",
      "a b",
      "x?y=1",
      "javascript:alert(1)",
      "https://evil.com",
      "",
      null,
      undefined,
      "x".repeat(31),
    ]) {
      expect(instagramUrl(bad as string), String(bad)).toBeNull();
    }
  });
});

describe("discordUrl", () => {
  it("accepts https Discord hosts only", () => {
    expect(discordUrl("https://discord.gg/abc123")).toBe("https://discord.gg/abc123");
    expect(discordUrl("https://discord.com/invite/abc")).toBe("https://discord.com/invite/abc");
    for (const bad of [
      "http://discord.gg/abc",
      "https://evil.com/discord.gg",
      "https://discord.gg.evil.com/x",
      "javascript:alert(1)",
      null,
      "",
    ]) {
      expect(discordUrl(bad as string), String(bad)).toBeNull();
    }
  });
});
