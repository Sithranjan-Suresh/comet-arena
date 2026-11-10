import { describe, expect, it } from "vitest";
import { acronym, resolveHostOrg } from "@/lib/orgs/resolve";
import { deriveFlags } from "@/lib/pipeline/flags";
import { loadFlyerCases } from "@/lib/fixtures";

const base = { title: "T", host: "H", description: null, format: "in_person" as const };

describe("deriveFlags", () => {
  it("defaults to a UTD-only campus competition", () => {
    expect(deriveFlags(base, { source: "instagram", hostOrgId: "org-1" })).toEqual({
      tier: "campus",
      utd_only: true,
      beginner_friendly: false,
    });
  });

  it("marks national competitions open to all students as external", () => {
    const f = deriveFlags(
      { ...base, title: "National Collegiate Case Open" },
      { source: "instagram", caption: "Open to all UTD students!" },
    );
    expect(f).toMatchObject({ tier: "national", utd_only: false });
  });

  it("treats Devpost and MLH listings as external; regional when text says so", () => {
    expect(deriveFlags(base, { source: "devpost" })).toMatchObject({ utd_only: false });
    expect(
      deriveFlags(
        { ...base, description: "For DFW area college students" },
        { source: "mlh", caption: "in-person" },
      ),
    ).toMatchObject({ tier: "regional", utd_only: false });
  });

  it("keeps a UTD-hosted event UTD-only even if it says national", () => {
    const f = deriveFlags(
      { ...base, title: "National Day Hackathon" },
      { source: "instagram", hostOrgId: "org-1" },
    );
    expect(f.utd_only).toBe(true);
  });

  it("detects beginner-friendly wording", () => {
    for (const t of [
      "Beginners welcome!",
      "No experience needed",
      "all skill levels",
      "first-time hackers",
    ]) {
      expect(
        deriveFlags(base, { source: "instagram", hostOrgId: "o", caption: t }).beginner_friendly,
        t,
      ).toBe(true);
    }
    expect(
      deriveFlags(base, { source: "instagram", hostOrgId: "o", caption: "Advanced teams only" })
        .beginner_friendly,
    ).toBe(false);
  });

  it("classifies the fixture posts sensibly", () => {
    for (const c of loadFlyerCases().filter((x) => x.expected.kind === "competition")) {
      const f = deriveFlags(c.expected, {
        source: "instagram",
        caption: c.caption,
        hostOrgId: c.id === "f13-national" ? null : c.org_slug,
      });
      if (c.id === "f13-national") expect(f).toMatchObject({ utd_only: false, tier: "national" });
      else expect(f.utd_only, c.id).toBe(true);
    }
    const hack = loadFlyerCases().find((c) => c.id === "f04-hackutd-24h")!;
    expect(
      deriveFlags(hack.expected, { source: "instagram", caption: hack.caption, hostOrgId: "x" })
        .beginner_friendly,
    ).toBe(true);
  });
});

const orgs = [
  {
    id: "1",
    name: "Association for Information Systems (AIS)",
    slug: "association-for-information-systems",
    utdclubs_slug: "ais",
  },
  { id: "2", name: "HackUTD", slug: "hackutd" },
  { id: "3", name: "Data Science Club", slug: "data-science-club" },
  { id: "4", name: "Design Guild", slug: "design-guild" },
  { id: "5", name: "Digital Student Club", slug: "digital-student-club" },
  { id: "6", name: "Dance Society Club", slug: "dance-society-club" },
];

describe("acronym", () => {
  it("skips stop words and needs two+ words", () => {
    expect(acronym("Association for Information Systems")).toBe("ais");
    expect(acronym("Association for Information Systems (AIS)")).toBe("ais");
    expect(acronym("HackUTD")).toBeNull();
  });
});

describe("resolveHostOrg", () => {
  it.each([
    ["AIS", "1"],
    ["ais", "1"],
    ["Association for Information Systems", "1"],
    ["hackutd", "2"],
    ["HackUTD!", "2"],
    ["Data Science Club", "3"],
    ["Design Guild (UTD)", "4"],
  ])("%s -> org %s", (host, id) => expect(resolveHostOrg(host, orgs)?.id).toBe(id));

  it("resolves an acronym when it is unique", () => {
    expect(resolveHostOrg("DSC", orgs.slice(0, 4))?.id).toBe("3"); // acronym of "Data Science Club"
  });

  it("returns null for unknown, empty and AMBIGUOUS names", () => {
    expect(resolveHostOrg("National Case Series", orgs)).toBeNull();
    expect(resolveHostOrg("", orgs)).toBeNull();
    expect(resolveHostOrg(null, orgs)).toBeNull();
    // "DSC" is the acronym of both Digital Student Club and Data Science Club: never guess
    expect(resolveHostOrg("DSC", [...orgs])).toBeNull();
  });
});
