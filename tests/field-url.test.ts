import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyFieldPatch,
  currentWindow,
  fieldHref,
  selectedCategories,
  windowPreset,
} from "@/lib/field-url";

const p = (qs: string) => new URLSearchParams(qs);

describe("applyFieldPatch", () => {
  it("sets and clears scalar filters and always resets paging", () => {
    const next = applyFieldPatch(p("q=hack&cursor=abc"), { format: "virtual" });
    expect(next.get("cursor")).toBeNull();
    expect(next.get("q")).toBe("hack");
    expect(next.get("format")).toBe("virtual");
    expect(applyFieldPatch(next, { format: undefined }).has("format")).toBe(false);
    expect(applyFieldPatch(next, { q: "" }).has("q")).toBe(false);
  });

  it("toggles booleans as 1 / absent", () => {
    expect(applyFieldPatch(p(""), { utd_only: true }).get("utd_only")).toBe("1");
    expect(applyFieldPatch(p("utd_only=1"), { utd_only: false }).has("utd_only")).toBe(false);
  });

  it("replaces the whole category list, de-duplicated", () => {
    const next = applyFieldPatch(p("categories=design&categories=speaking"), {
      categories: ["hackathon", "hackathon", "finance"],
    });
    expect(next.getAll("categories")).toEqual(["hackathon", "finance"]);
    expect(applyFieldPatch(next, { categories: [] }).has("categories")).toBe(false);
  });

  it("leaves untouched keys alone and does not mutate its input", () => {
    const input = p("q=a&cost=free");
    const next = applyFieldPatch(input, { format: "hybrid" });
    expect(next.get("cost")).toBe("free");
    expect(input.has("format")).toBe(false);
  });
});

describe("fieldHref", () => {
  it("omits the query string when there are no filters and encodes values", () => {
    expect(fieldHref(p(""))).toBe("/field");
    expect(fieldHref(p("q=case comp"))).toBe("/field?q=case+comp");
  });
});

describe("activeFilterCount / selectedCategories", () => {
  it("counts filters but not paging, and reads comma-separated categories", () => {
    const params = p(
      "q=x&format=virtual&utd_only=1&categories=hackathon,design&cursor=zzz&limit=5",
    );
    expect(activeFilterCount(params)).toBe(5);
    expect(selectedCategories(params)).toEqual(["hackathon", "design"]);
    expect(activeFilterCount(p(""))).toBe(0);
  });
});

describe("deadline window presets", () => {
  const today = new Date("2026-11-10T18:00:00Z");
  it("computes Chicago-date ranges", () => {
    expect(windowPreset("7", today)).toEqual({ from: "2026-11-10", to: "2026-11-17" });
    expect(windowPreset("30", today)).toEqual({ from: "2026-11-10", to: "2026-12-10" });
    expect(windowPreset("any", today)).toEqual({ from: undefined, to: undefined });
  });

  it("recognizes the current selection", () => {
    expect(currentWindow(p(""), today)).toBe("any");
    expect(currentWindow(p("from=2026-11-10&to=2026-11-17"), today)).toBe("7");
    expect(currentWindow(p("from=2026-11-10&to=2026-12-10"), today)).toBe("30");
    expect(currentWindow(p("from=2026-01-01&to=2026-01-05"), today)).toBe("custom");
  });
});
