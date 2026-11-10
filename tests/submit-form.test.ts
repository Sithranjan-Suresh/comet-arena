import { describe, expect, it } from "vitest";
import { loadFlyerCases } from "@/lib/fixtures";
import {
  chicagoLocalFromIso,
  emptyForm,
  extractionToForm,
  fieldsNeedingReview,
  formToPayload,
  isoFromChicagoLocal,
  moveStage,
  validateForm,
} from "@/lib/submit/form";
import { extractionFromConfirm } from "@/lib/submit/confirm";

const cases = loadFlyerCases();
const byId = (id: string) => cases.find((c) => c.id === id)!.expected;

describe("Chicago local <-> ISO", () => {
  it("round-trips winter (CST) and summer (CDT) times", () => {
    expect(chicagoLocalFromIso("2026-11-21T05:59:00Z")).toBe("2026-11-20T23:59");
    expect(isoFromChicagoLocal("2026-11-20T23:59")).toBe("2026-11-21T05:59:00.000Z");
    expect(chicagoLocalFromIso("2026-07-04T17:00:00Z")).toBe("2026-07-04T12:00");
    expect(isoFromChicagoLocal("2026-07-04T12:00")).toBe("2026-07-04T17:00:00.000Z");
  });

  it("handles the DST changes (Nov 1 fall back, Mar 8 spring forward)", () => {
    expect(isoFromChicagoLocal("2026-11-01T12:00")).toBe("2026-11-01T18:00:00.000Z");
    expect(isoFromChicagoLocal("2027-03-14T12:00")).toBe("2027-03-14T17:00:00.000Z");
    for (const iso of ["2026-11-01T06:30:00Z", "2027-03-14T08:00:00Z", "2026-12-05T23:00:00Z"]) {
      expect(isoFromChicagoLocal(chicagoLocalFromIso(iso))).toBe(new Date(iso).toISOString());
    }
  });

  it("rejects malformed input and impossible dates", () => {
    for (const bad of ["", "2026-11-20", "2026-11-20 23:59", "2026-02-30T10:00", "garbage"])
      expect(isoFromChicagoLocal(bad), bad).toBeNull();
    expect(chicagoLocalFromIso("")).toBe("");
    expect(chicagoLocalFromIso(null)).toBe("");
    expect(chicagoLocalFromIso("nope")).toBe("");
  });
});

describe("extractionToForm / formToPayload round trip", () => {
  it("pre-fills every field from an extraction and produces a payload the server accepts", () => {
    const ex = byId("f01-ais-case");
    const form = extractionToForm(ex);
    expect(form).toMatchObject({
      title: "AIS Fall Case Competition",
      host: "AIS",
      categories: ["case_competition", "finance"],
      teamMin: "3",
      teamMax: "4",
      cost: "free",
      registerUrl: "https://example.com/register/ais-fall-case",
    });
    expect(form.stages).toHaveLength(3);
    const v = validateForm(form);
    expect(v.errors).toBeNull();
    // what the server would publish matches what the model read
    const back = extractionFromConfirm(v.input!);
    expect(back.stages.map((s) => s.deadline_at)).toEqual(
      ex.stages.map((s) => new Date(s.deadline_at).toISOString()),
    );
    expect(back.title).toBe(ex.title);
  });

  it("empty form has one blank round and is invalid in the ways the spec requires", () => {
    const v = validateForm(emptyForm());
    expect(v.input).toBeNull();
    expect(Object.keys(v.errors!)).toEqual(
      expect.arrayContaining(["title", "categories", "stages", "register_url"]),
    );
  });

  it("marks 'no link yet' when the model reported a missing register link", () => {
    expect(extractionToForm(byId("f05-pitch-night")).noLinkYet).toBe(true);
    expect(extractionToForm(byId("f01-ais-case")).noLinkYet).toBe(false);
  });

  it("an unreadable post (null extraction) gives the blank manual-entry form", () => {
    expect(extractionToForm(null)).toEqual(emptyForm());
  });
});

describe("validateForm", () => {
  const good = () => extractionToForm(byId("f01-ais-case"));

  it("requires title, a category, a dated round and a link (or the 'no link yet' box)", () => {
    const f = { ...good(), title: "", categories: [], registerUrl: "", noLinkYet: false };
    expect(Object.keys(validateForm(f).errors!)).toEqual(
      expect.arrayContaining(["title", "categories", "register_url"]),
    );
    expect(
      validateForm({ ...f, title: "A real title", categories: ["hackathon"], noLinkYet: true })
        .errors,
    ).toBeNull();
  });

  it("explains a missing or invalid round date in plain words", () => {
    const f = { ...good(), stages: [{ name: "Finals", starts: "", deadline: "" }] };
    expect(validateForm(f).errors!["stages.0.deadline_at"]).toMatch(/date and time/);
    const g = { ...good(), stages: [{ name: "Finals", starts: "", deadline: "2026-02-30T10:00" }] };
    expect(validateForm(g).errors!["stages.0.deadline_at"]).toMatch(/date and time/);
  });

  it("drops fully blank round rows instead of failing on them", () => {
    const f = { ...good(), stages: [...good().stages, { name: "", starts: "", deadline: "" }] };
    expect(validateForm(f).input!.stages).toHaveLength(3);
  });

  it("catches a round that starts after it ends and a larger minimum team", () => {
    const f = {
      ...good(),
      stages: [{ name: "Hack", starts: "2026-12-06T10:00", deadline: "2026-12-05T10:00" }],
      teamMin: "5",
      teamMax: "2",
    };
    const e = validateForm(f).errors!;
    expect(e["stages.0.starts_at"]).toMatch(/cannot start after/);
    expect(e["eligibility.team_min"]).toMatch(/team size/);
  });

  it("splits majors on commas and trims, and carries merge_into through", () => {
    const f = { ...good(), majors: " Accounting ,Finance,, " };
    expect(
      (
        formToPayload(f, { merge_into: "abc" }) as {
          eligibility: { majors: string[] };
          merge_into: string;
        }
      ).eligibility.majors,
    ).toEqual(["Accounting", "Finance"]);
    expect((formToPayload(f, { merge_into: "abc" }) as { merge_into: string }).merge_into).toBe(
      "abc",
    );
  });
});

describe("fieldsNeedingReview", () => {
  it("flags what the model could not read and the dates when confidence is low", () => {
    const messy = fieldsNeedingReview(byId("f14-messy"));
    expect([...messy]).toEqual(expect.arrayContaining(["stages", "registerUrl", "description"]));
    const clean = fieldsNeedingReview(byId("f01-ais-case"));
    expect(clean.size).toBe(0);
    expect(fieldsNeedingReview(byId("f05-pitch-night")).has("registerUrl")).toBe(true);
  });
});

describe("moveStage", () => {
  const s = (n: string) => ({ name: n, starts: "", deadline: "" });
  it("reorders without mutating and ignores out-of-range moves", () => {
    const base = [s("a"), s("b"), s("c")];
    expect(moveStage(base, 0, 2).map((x) => x.name)).toEqual(["b", "c", "a"]);
    expect(base.map((x) => x.name)).toEqual(["a", "b", "c"]);
    expect(moveStage(base, 1, 1)).toBe(base);
    expect(moveStage(base, -1, 1)).toBe(base);
    expect(moveStage(base, 0, 9)).toBe(base);
  });
});
