import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import {
  type IcsStage,
  buildIcs,
  escapeText,
  foldLine,
  isDateOnlyDeadline,
  utcStamp,
} from "@/lib/ics";

const now = new Date("2026-11-10T15:00:00Z");
const stage = (over: Partial<IcsStage> = {}): IcsStage => ({
  stage_id: "11111111-1111-4111-8111-111111111111",
  stage_name: "Registration closes",
  starts_at: null,
  deadline_at: "2026-11-21T05:59:00Z", // Nov 20 11:59 PM CST: date-only
  title: "AIS Fall Case Competition",
  slug: "ais-fall-case",
  register_url: "https://example.com/r?a=1&b=2",
  updated_at: "2026-11-09T12:00:00Z",
  ...over,
});
const build = (stages: IcsStage[]) =>
  buildIcs({ stages, appUrl: "https://cometarena.example/", now });
const parse = (ics: string) => new ICAL.Component(ICAL.parse(ics));

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and newlines (RFC 5545 TEXT)", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\;c\\,d\\ne\\nf");
  });
});

describe("foldLine", () => {
  const octets = (s: string) => new TextEncoder().encode(s).length;
  it("leaves short lines alone", () => expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short"));

  it("folds at 75 octets with CRLF+space and unfolding restores the original", () => {
    const line = "DESCRIPTION:" + "word ".repeat(60);
    const folded = foldLine(line);
    const physical = folded.split("\r\n");
    expect(physical.length).toBeGreaterThan(1);
    for (const l of physical) expect(octets(l)).toBeLessThanOrEqual(75);
    for (const l of physical.slice(1)) expect(l.startsWith(" ")).toBe(true);
    expect(physical.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(line);
  });

  it("never splits a multi-byte character", () => {
    const line = "SUMMARY:" + "日本語のコンペ🎓".repeat(20);
    const folded = foldLine(line);
    for (const l of folded.split("\r\n")) expect(octets(l)).toBeLessThanOrEqual(75);
    expect(
      folded
        .split("\r\n")
        .map((l, i) => (i ? l.slice(1) : l))
        .join(""),
    ).toBe(line);
  });
});

describe("buildIcs", () => {
  it("is a well-formed calendar with CRLF endings and calendar metadata", () => {
    const ics = build([stage()]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/); // no bare newlines
    const cal = parse(ics);
    expect(cal.getFirstPropertyValue("version")).toBe("2.0");
    expect(cal.getFirstPropertyValue("x-wr-calname")).toBe("Comet Arena deadlines");
    expect(cal.getFirstPropertyValue("x-wr-timezone")).toBe("America/Chicago");
  });

  it("round-trips through a real iCalendar parser: summary, description, url and alarm", () => {
    const ev = new ICAL.Event(parse(build([stage()])).getFirstSubcomponent("vevent")!);
    expect(ev.summary).toBe("AIS Fall Case Competition: Registration closes");
    expect(ev.description).toContain("https://example.com/r?a=1&b=2");
    expect(ev.description).toContain("https://cometarena.example/game/ais-fall-case");
    expect(ev.component.getFirstPropertyValue("url")).toBe(
      "https://cometarena.example/game/ais-fall-case",
    );
    const alarm = ev.component.getFirstSubcomponent("valarm")!;
    expect(String(alarm.getFirstPropertyValue("trigger"))).toBe("-P1D");
    expect(alarm.getFirstPropertyValue("action")).toBe("DISPLAY");
  });

  it("publishes a date-only (23:59 CT) deadline as an all-day event on the right local day", () => {
    const ev = new ICAL.Event(parse(build([stage()])).getFirstSubcomponent("vevent")!);
    expect(ev.startDate.isDate).toBe(true);
    expect(ev.startDate.toString()).toBe("2026-11-20"); // Nov 20 in Chicago, not Nov 21 (UTC)
    expect(ev.endDate.toString()).toBe("2026-11-21");
  });

  it("publishes a timed deadline as a 30-minute event ending at the deadline", () => {
    const ev = new ICAL.Event(
      parse(build([stage({ deadline_at: "2026-12-05T23:00:00Z" })])).getFirstSubcomponent(
        "vevent",
      )!,
    );
    expect(ev.startDate.isDate).toBe(false);
    expect(ev.endDate.toJSDate().toISOString()).toBe("2026-12-05T23:00:00.000Z");
    expect(ev.startDate.toJSDate().toISOString()).toBe("2026-12-05T22:30:00.000Z");
  });

  it("uses the stage's own start and end for multi-day stages", () => {
    const ev = new ICAL.Event(
      parse(
        build([stage({ starts_at: "2027-02-06T18:00:00Z", deadline_at: "2027-02-07T18:00:00Z" })]),
      ).getFirstSubcomponent("vevent")!,
    );
    expect(ev.startDate.toJSDate().toISOString()).toBe("2027-02-06T18:00:00.000Z");
    expect(ev.endDate.toJSDate().toISOString()).toBe("2027-02-07T18:00:00.000Z");
    expect(
      isDateOnlyDeadline({
        starts_at: "2027-02-06T18:00:00Z",
        deadline_at: "2027-02-08T05:59:00Z",
      }),
    ).toBe(false);
  });

  it("uses a stable UID per stage so changed dates update the event instead of duplicating it", () => {
    const a = build([stage()]);
    const b = build([stage({ deadline_at: "2026-11-28T05:59:00Z" })]);
    const uid = (ics: string) =>
      parse(ics).getFirstSubcomponent("vevent")!.getFirstPropertyValue("uid");
    expect(uid(a)).toBe("stage-11111111-1111-4111-8111-111111111111@cometarena");
    expect(uid(a)).toBe(uid(b));
  });

  it("carries LAST-MODIFIED from the competition so clients can detect updates", () => {
    const v = parse(build([stage()])).getFirstSubcomponent("vevent")!;
    expect((v.getFirstPropertyValue("last-modified") as ICAL.Time).toJSDate().toISOString()).toBe(
      "2026-11-09T12:00:00.000Z",
    );
  });

  it("emits one event per stage, ordered by deadline, and an empty but valid calendar for no stages", () => {
    const ics = build([
      stage({ stage_id: "b", deadline_at: "2026-12-05T23:00:00Z" }),
      stage({ stage_id: "a", deadline_at: "2026-11-21T05:59:00Z" }),
    ]);
    const events = parse(ics).getAllSubcomponents("vevent");
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.getFirstPropertyValue("uid"))).toEqual([
      "stage-a@cometarena",
      "stage-b@cometarena",
    ]);
    const empty = parse(build([]));
    expect(empty.getAllSubcomponents("vevent")).toHaveLength(0);
  });

  it("escapes hostile titles and keeps every physical line within 75 octets", () => {
    const ics = build([stage({ title: "Case; Comp, with\\ weird\nnewline " + "x".repeat(200) })]);
    for (const l of ics.split("\r\n"))
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    const ev = new ICAL.Event(parse(ics).getFirstSubcomponent("vevent")!);
    expect(ev.summary.startsWith("Case; Comp, with\\ weird\nnewline x")).toBe(true);
    // injected property lines are impossible: a newline in the title cannot start a new property
    expect(ics).not.toMatch(/\r\nnewline/);
  });

  it("omits the register line when there is no link", () => {
    const ev = new ICAL.Event(
      parse(build([stage({ register_url: null })])).getFirstSubcomponent("vevent")!,
    );
    expect(ev.description).not.toContain("Register:");
  });
});

describe("utcStamp", () => {
  it("formats basic-format UTC timestamps", () =>
    expect(utcStamp(new Date("2026-11-21T05:59:07Z"))).toBe("20261121T055907Z"));
});
