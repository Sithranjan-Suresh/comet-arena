import { describe, expect, it } from "vitest";
import { formatResumeList } from "@/lib/resume";

const e = (
  title: string,
  result: Parameters<typeof formatResumeList>[0][number]["result"],
  season = "Fall 2026",
  team = "",
  verified = false,
) => ({ title, result, season, team_name: team, verified_by_host: verified });

describe("formatResumeList", () => {
  it("formats `Title — Result (Season), Team` with a self-reported marker and footnote", () => {
    expect(
      formatResumeList([e("AIS Fall Case Competition", "second", "Fall 2026", "Comet Coders")]),
    ).toBe(
      "• AIS Fall Case Competition — 2nd place (Fall 2026), Comet Coders *\n\n* Self-reported",
    );
  });

  it("orders by strongest result, then most recent season, then title", () => {
    const out = formatResumeList([
      e("B Hack", "participated", "Fall 2026"),
      e("A Case", "first", "Spring 2025"),
      e("C Pitch", "first", "Fall 2026"),
      e("D Data", "finalist", "Fall 2026"),
      e("E Design", "participated", "Spring 2026"),
    ]);
    expect(
      out
        .split("\n")
        .filter((l) => l.startsWith("•"))
        .map((l) => l.split(" — ")[0]),
    ).toEqual(["• C Pitch", "• A Case", "• D Data", "• B Hack", "• E Design"]);
  });

  it("does not mark host-verified results, and omits the footnote when everything is verified", () => {
    const out = formatResumeList([e("Verified One", "first", "Fall 2026", "", true)]);
    expect(out).toBe("• Verified One — 1st place (Fall 2026)");
    expect(out).not.toContain("*");
  });

  it("can drop the footnote and tolerates an empty list and blank team names", () => {
    expect(formatResumeList([e("X", "advanced", "Fall 2026", "   ")], { footnote: false })).toBe(
      "• X — Advanced (Fall 2026) *",
    );
    expect(formatResumeList([])).toBe("");
  });
});
