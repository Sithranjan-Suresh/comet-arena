import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flyerImagePath, loadFeedListings, loadFlyerCases } from "@/lib/fixtures";

const cases = loadFlyerCases();

describe("flyer fixtures", () => {
  it("has 20 cases with unique ids", () => {
    expect(cases).toHaveLength(20);
    expect(new Set(cases.map((c) => c.id)).size).toBe(20);
  });

  it("covers competitions, results recaps and non-competition posts", () => {
    const count = (k: string) => cases.filter((c) => c.expected.kind === k).length;
    expect(count("competition")).toBe(14);
    expect(count("results")).toBe(3);
    expect(count("not_competition")).toBe(3);
  });

  it("every referenced image exists and every generated PNG is referenced", () => {
    const referenced = new Set(cases.flatMap((c) => c.images));
    for (const f of referenced) expect(existsSync(flyerImagePath(f)), f).toBe(true);
    const onDisk = readdirSync(flyerImagePath("")).filter((f) => f.endsWith(".png"));
    expect(new Set(onDisk)).toEqual(referenced);
  });

  it("uses sample handles only (no real accounts implied)", () => {
    for (const c of cases) expect(c.ig_handle).toMatch(/_sample$/);
  });

  it("includes the scenarios the pipeline must handle", () => {
    const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
    // Same competition from three clubs shares its stages (dedupe demo).
    const trio = ["f01-ais-case", "f02-ais-case-repost", "f03-ais-case-repost2"].map(
      (id) => byId[id].expected.stages,
    );
    expect(trio[1]).toEqual(trio[0]);
    expect(trio[2]).toEqual(trio[0]);
    // Carousel has more than one image; messy flyer is low confidence; pitch night has no link.
    expect(byId["f09-design-jam"].images).toHaveLength(2);
    expect(byId["f14-messy"].expected.confidence).toBeLessThan(0.8);
    expect(byId["f05-pitch-night"].expected.register_url).toBeNull();
    expect(byId["f05-pitch-night"].expected.missing_fields).toContain("register_url");
    // Date range becomes one stage with a start.
    const range = byId["f04-hackutd-24h"].expected.stages.at(-1)!;
    expect(range.starts_at).not.toBeNull();
  });

  it("canned competitions have at least one dated stage unless deliberately messy", () => {
    for (const c of cases.filter(
      (x) => x.expected.kind === "competition" && x.id !== "f14-messy",
    )) {
      expect(c.expected.stages.length, c.id).toBeGreaterThan(0);
    }
  });
});

describe("feed fixtures", () => {
  it("has two Devpost listings with text to extract from", () => {
    const listings = loadFeedListings();
    expect(listings).toHaveLength(2);
    for (const l of listings) {
      expect(l.source).toBe("devpost");
      expect(l.text.length).toBeGreaterThan(40);
    }
  });
});
