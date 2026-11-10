import { describe, expect, it } from "vitest";
import { eligibilityLines, eventJsonLd, safeExternalUrl, teamSizeLabel } from "@/lib/format";
import type { GameDayDTO } from "@/lib/schemas";

describe("safeExternalUrl", () => {
  it("allows http(s) and rejects everything else", () => {
    expect(safeExternalUrl("https://example.com/r?x=1")).toBe("https://example.com/r?x=1");
    expect(safeExternalUrl("http://example.com")).toBe("http://example.com/");
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>",
      "file:///etc/passwd",
      "mailto:a@b.c",
      "//evil.com",
      "not a url",
      "",
      null,
      undefined,
    ]) {
      expect(safeExternalUrl(bad as string), String(bad)).toBeNull();
    }
  });
});

describe("teamSizeLabel", () => {
  it.each([
    [{ team_min: 1, team_max: 1 }, "Solo"],
    [{ team_min: 3, team_max: 4 }, "Teams of 3 to 4"],
    [{ team_min: 2, team_max: 2 }, "Teams of 2"],
    [{ team_min: null, team_max: 4 }, "Teams up to 4"],
    [{ team_min: 2, team_max: null }, "Teams of at least 2"],
    [{ team_min: null, team_max: null }, null],
    [null, null],
  ])("%j -> %s", (e, expected) => expect(teamSizeLabel(e)).toBe(expected));
});

describe("eligibilityLines", () => {
  const e = (over = {}) => ({
    majors: [],
    class_years: [],
    course_prereqs: [],
    team_min: null,
    team_max: null,
    cross_school: false,
    ...over,
  });
  it("says open to all when nothing restricts entry", () => {
    expect(eligibilityLines(null)).toEqual(["Open to all UTD students"]);
    expect(eligibilityLines(e())).toEqual(["Open to all UTD students"]);
    expect(eligibilityLines(e({ team_min: 1, team_max: 4 }))).toEqual([
      "Open to all UTD students",
      "Teams of 1 to 4",
    ]);
  });
  it("lists majors, years, prerequisites and team size in plain language", () => {
    expect(
      eligibilityLines(
        e({
          majors: ["Accounting", "Finance", "Marketing"],
          class_years: ["junior", "senior"],
          course_prereqs: ["CS 2336"],
          team_min: 3,
          team_max: 4,
        }),
      ),
    ).toEqual([
      "Open to Accounting, Finance, and Marketing majors",
      "Juniors and Seniors",
      "Prerequisites: CS 2336",
      "Teams of 3 to 4",
    ]);
  });
  it("explains cross-school competitions", () => {
    expect(eligibilityLines(e({ majors: ["Finance"], cross_school: true }))[0]).toBe(
      "Aimed at Finance majors, open to all schools",
    );
  });
});

describe("eventJsonLd", () => {
  const dto = (over: Partial<GameDayDTO> = {}): GameDayDTO =>
    ({
      id: "x",
      slug: "case",
      title: "Case Comp",
      host_name: "AIS",
      host_slug: "ais",
      categories: [],
      description: "d",
      tier: "campus",
      prize: null,
      cost: "free",
      format: "virtual",
      location: "Online",
      register_url: null,
      utd_only: true,
      beginner_friendly: false,
      status: "live",
      confirmations: 0,
      flyer_url: null,
      updated_at: "2026-11-01T00:00:00Z",
      stages: [
        { id: "a", name: "Reg", starts_at: null, deadline_at: "2026-11-20T00:00:00Z", order: 1 },
        {
          id: "b",
          name: "Final",
          starts_at: "2026-12-05T15:00:00Z",
          deadline_at: "2026-12-05T23:00:00Z",
          order: 2,
        },
      ],
      eligibility: null,
      sources: [],
      viewer_saved: false,
      viewer_eligible: null,
      ...over,
    }) as GameDayDTO;

  it("builds schema.org Event data from the DTO", () => {
    const j = JSON.parse(eventJsonLd(dto(), "https://x.example/"));
    expect(j).toMatchObject({
      "@type": "Event",
      name: "Case Comp",
      url: "https://x.example/game/case",
      startDate: "2026-12-05T15:00:00Z",
      endDate: "2026-12-05T23:00:00Z",
      eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
      isAccessibleForFree: true,
    });
    expect(
      JSON.parse(eventJsonLd(dto({ status: "past" }), "https://x.example")).eventStatus,
    ).toContain("EventCompleted");
  });

  it("cannot be broken out of a <script> tag by a hostile title", () => {
    const out = eventJsonLd(
      dto({ title: "</script><script>alert(1)</script>" }),
      "https://x.example",
    );
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>"); // still decodes to the original text
  });
});
