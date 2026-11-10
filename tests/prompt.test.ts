import { describe, expect, it } from "vitest";
import { buildExtractionPrompt, buildRepairPrompt, todayLine } from "@/lib/extract/prompt";
import { CATEGORIES } from "@/lib/schemas";
import { REPAIR_MARKER } from "@/lib/sources/mock/constants";

const now = new Date("2026-11-10T15:00:00Z");

describe("todayLine", () => {
  it("uses the Chicago calendar day and weekday", () => {
    expect(todayLine(now)).toBe("Tuesday, 2026-11-10");
    // 02:00 UTC on the 11th is still the 10th in Chicago
    expect(todayLine(new Date("2026-11-11T02:00:00Z"))).toBe("Tuesday, 2026-11-10");
  });
});

describe("buildExtractionPrompt", () => {
  const { system, user } = buildExtractionPrompt({
    now,
    caption: "FALL CASE COMP! Register by Nov 20.",
    postedAt: "2026-11-03T15:00:00Z",
    sourceUrl: "https://instagram.example/p/abc",
    imageCount: 2,
  });

  it("includes today's date, the time zone and the anti-hallucination rule", () => {
    expect(system).toContain("Today is Tuesday, 2026-11-10");
    expect(system).toContain("America/Chicago");
    expect(system).toMatch(/NEVER invent a date/);
    expect(system).toContain("missing_fields");
  });

  it("lists every category id exactly as the schema defines them", () => {
    for (const c of CATEGORIES) expect(system).toContain(`- ${c}:`);
  });

  it("explains year inference, date ranges and results posts", () => {
    expect(system).toMatch(/no year/i);
    expect(system).toMatch(/ONE stage/);
    expect(system).toMatch(/"results"/);
  });

  it("ends the system prompt with the exact output shape and demands JSON only", () => {
    expect(system).toContain("Respond with ONLY one JSON object");
    expect(system).toContain('"confidence": number');
  });

  it("puts post context in the user prompt and flags carousels", () => {
    expect(user).toContain("Post date: 2026-11-03T15:00:00Z");
    expect(user).toContain("Source URL: https://instagram.example/p/abc");
    expect(user).toContain("a carousel");
    expect(user).toContain("FALL CASE COMP!");
  });

  it("handles a missing caption and unknown post date", () => {
    const p = buildExtractionPrompt({ now, imageCount: 1 });
    expect(p.user).toContain("Post date: unknown");
    expect(p.user).toContain("(no caption)");
    expect(p.user).not.toContain("carousel");
  });

  it("is reproducible: same inputs give identical prompts", () => {
    const again = buildExtractionPrompt({
      now,
      caption: "FALL CASE COMP! Register by Nov 20.",
      postedAt: "2026-11-03T15:00:00Z",
      sourceUrl: "https://instagram.example/p/abc",
      imageCount: 2,
    });
    expect(again).toEqual({ system, user });
  });
});

describe("buildRepairPrompt", () => {
  it("carries the repair marker, the error and a truncated previous output", () => {
    const base = buildExtractionPrompt({ now, imageCount: 1 });
    const repair = buildRepairPrompt(
      base,
      "x".repeat(10_000),
      "stages.0.deadline_at: Invalid datetime",
    );
    expect(repair.system).toBe(base.system);
    expect(repair.user).toContain(REPAIR_MARKER);
    expect(repair.user).toContain("Invalid datetime");
    expect(repair.user.length).toBeLessThan(base.user.length + 5000);
  });
});
