import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/theme/contrast";
import { colors, textPairs } from "@/lib/theme/tokens";

describe("contrastRatio", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
});

describe("design tokens", () => {
  it.each(textPairs)("$fg on $bg ($use) meets $min:1", ({ fg, bg, min }) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });

  it("keeps the brand colors from the spec", () => {
    expect(colors["utd-orange"]).toBe("#e87500");
    expect(colors["utd-green"]).toBe("#154734");
  });

  it("mirrors every token in app/globals.css", () => {
    const css = readFileSync(path.resolve(import.meta.dirname, "../app/globals.css"), "utf8");
    for (const [name, hex] of Object.entries(colors)) {
      expect(css, `--color-${name}`).toContain(`--color-${name}: ${hex};`);
    }
  });
});
