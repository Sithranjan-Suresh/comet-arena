import ICAL from "ical.js";
import { describe, expect, it, vi } from "vitest";
import { FEED_LOOKBACK_DAYS, buildUserFeed, tokenFromSegment } from "@/lib/calendar-feed";
import { toIcsStages } from "@/lib/data/ics-feed";
import type { IcsStage } from "@/lib/ics";

const TOKEN = "a1".repeat(24);
const now = new Date("2026-11-10T15:00:00Z");
const stage = (id: string, deadline: string): IcsStage => ({
  stage_id: id,
  stage_name: `Stage ${id}`,
  starts_at: null,
  deadline_at: deadline,
  title: "Comp",
  slug: "comp",
  register_url: null,
  updated_at: "2026-11-01T00:00:00Z",
});
const deps = (over: Partial<Parameters<typeof buildUserFeed>[1]> = {}) => ({
  findUserIdByToken: vi.fn(async (t: string) => (t === TOKEN ? "user-1" : null)),
  fetchStages: vi.fn(async () => [
    stage("a", "2026-11-20T23:00:00Z"),
    stage("b", "2026-12-05T23:00:00Z"),
  ]),
  appUrl: "https://cometarena.example",
  now,
  ...over,
});

describe("tokenFromSegment", () => {
  it("accepts <48 hex>.ics only", () => {
    expect(tokenFromSegment(`${TOKEN}.ics`)).toBe(TOKEN);
    for (const bad of [
      TOKEN,
      `${TOKEN}.txt`,
      `${TOKEN.slice(1)}.ics`,
      `${TOKEN.toUpperCase()}.ics`,
      `${TOKEN}x.ics`,
      ".ics",
      "../etc/passwd.ics",
      "",
    ]) {
      expect(tokenFromSegment(bad), bad).toBeNull();
    }
  });
});

describe("buildUserFeed", () => {
  it("returns a parsable calendar with one event per saved stage", async () => {
    const r = await buildUserFeed(`${TOKEN}.ics`, deps());
    expect(r.status).toBe(200);
    if (r.status !== 200) return;
    const events = new ICAL.Component(ICAL.parse(r.body)).getAllSubcomponents("vevent");
    expect(events.map((e) => e.getFirstPropertyValue("uid"))).toEqual([
      "stage-a@cometarena",
      "stage-b@cometarena",
    ]);
  });

  it("gives unknown, malformed and revoked tokens the same 404, without touching the database for malformed ones", async () => {
    const d = deps();
    expect(await buildUserFeed(`${"b2".repeat(24)}.ics`, d)).toEqual({ status: 404 });
    expect(await buildUserFeed("garbage.ics", d)).toEqual({ status: 404 });
    expect(d.findUserIdByToken).toHaveBeenCalledTimes(1); // only the well-formed unknown token was looked up
    expect(d.fetchStages).not.toHaveBeenCalled();
  });

  it("drops stages older than the lookback window", async () => {
    const old = new Date(now.getTime() - (FEED_LOOKBACK_DAYS + 5) * 86_400_000).toISOString();
    const recent = new Date(now.getTime() - 5 * 86_400_000).toISOString();
    const r = await buildUserFeed(
      `${TOKEN}.ics`,
      deps({ fetchStages: async () => [stage("old", old), stage("recent", recent)] }),
    );
    if (r.status !== 200) throw new Error("expected 200");
    expect(r.body).toContain("stage-recent@cometarena");
    expect(r.body).not.toContain("stage-old@cometarena");
  });

  it("returns an empty but valid calendar for a user with nothing saved", async () => {
    const r = await buildUserFeed(`${TOKEN}.ics`, deps({ fetchStages: async () => [] }));
    if (r.status !== 200) throw new Error("expected 200");
    expect(new ICAL.Component(ICAL.parse(r.body)).getAllSubcomponents("vevent")).toHaveLength(0);
  });

  it("reports 503 when the database fails (never a partial or empty calendar that would wipe events)", async () => {
    const r = await buildUserFeed(
      `${TOKEN}.ics`,
      deps({
        fetchStages: async () => {
          throw new Error("db");
        },
      }),
    );
    expect(r).toEqual({ status: 503 });
    const r2 = await buildUserFeed(
      `${TOKEN}.ics`,
      deps({
        findUserIdByToken: async () => {
          throw new Error("db");
        },
      }),
    );
    expect(r2).toEqual({ status: 503 });
  });
});

describe("toIcsStages", () => {
  it("flattens saved competitions and skips rejected or missing ones", () => {
    const c = (status: string) => ({
      id: "c",
      slug: "s",
      title: "T",
      status,
      register_url: null,
      updated_at: "2026-11-01T00:00:00Z",
      stages: [{ id: "x", name: "R", starts_at: null, deadline_at: "2026-11-20T00:00:00Z" }],
    });
    expect(
      toIcsStages([
        { competition: c("live") },
        { competition: c("rejected") },
        { competition: null },
      ]),
    ).toHaveLength(1);
  });
});
