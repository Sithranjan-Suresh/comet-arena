import { describe, expect, it } from "vitest";
import { ALL_BADGES, computeBadges } from "@/lib/awards";
import { resourceInputSchema } from "@/lib/office";
import { safeResourceUrl } from "@/lib/data/extras";

const e = (result: string, over = {}) => ({
  result: result as never,
  rounds_advanced: 0,
  verified_by_host: false,
  ...over,
});
const ids = (entries: ReturnType<typeof e>[]) => computeBadges(entries).map((b) => b.id);

describe("computeBadges", () => {
  it("no entries, no badges", () => expect(ids([])).toEqual([]));
  it("a first entry earns the starter badge only", () =>
    expect(ids([e("participated")])).toEqual(["first-entry"]));
  it("placing builds the ladder: advancer, finalist, podium, champion", () => {
    expect(ids([e("advanced")])).toEqual(["first-entry", "advanced"]);
    expect(ids([e("finalist")])).toEqual(["first-entry", "advanced", "finalist"]);
    expect(ids([e("third")])).toEqual(["first-entry", "advanced", "finalist", "podium"]);
    expect(ids([e("first")])).toEqual([
      "first-entry",
      "advanced",
      "finalist",
      "podium",
      "champion",
    ]);
  });
  it("rounds advanced count as advancing even for a plain participant", () =>
    expect(ids([e("participated", { rounds_advanced: 2 })])).toContain("advanced"));
  it("hat trick needs three wins; regular needs five entries; verified needs a host-confirmed result", () => {
    expect(ids([e("first"), e("first")])).not.toContain("hat-trick");
    expect(ids([e("first"), e("first"), e("first")])).toContain("hat-trick");
    expect(ids(Array.from({ length: 5 }, () => e("participated")))).toContain("regular");
    expect(ids([e("participated", { verified_by_host: true })])).toContain("verified");
  });
  it("every badge has a unique id, label and spoken description", () => {
    expect(new Set(ALL_BADGES.map((b) => b.id)).size).toBe(ALL_BADGES.length);
    for (const b of ALL_BADGES) expect(b.label && b.description).toBeTruthy();
  });
});

describe("resources", () => {
  it("accepts https links with a short label and rejects scripts, junk and long labels", () => {
    expect(
      resourceInputSchema.safeParse({ label: "Rubric", url: "https://example.com/r" }).success,
    ).toBe(true);
    expect(resourceInputSchema.safeParse({ label: "x", url: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(resourceInputSchema.safeParse({ label: "x", url: "not a url" }).success).toBe(false);
    expect(resourceInputSchema.safeParse({ label: "", url: "https://example.com" }).success).toBe(
      false,
    );
    expect(
      resourceInputSchema.safeParse({ label: "x".repeat(81), url: "https://example.com" }).success,
    ).toBe(false);
  });
  it("only http(s) links are ever rendered", () => {
    expect(safeResourceUrl("https://a.example")).toBe("https://a.example");
    expect(safeResourceUrl("javascript:alert(1)")).toBeNull();
    expect(safeResourceUrl("data:text/html,x")).toBeNull();
  });
});
