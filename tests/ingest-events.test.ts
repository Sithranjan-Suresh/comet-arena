import { describe, expect, it, vi } from "vitest";
import { categoriesFor, classifyEvent, eventToExtraction } from "@/lib/events/classify";
import { type IngestEventsStore, runIngestEvents } from "@/lib/jobs/ingest-events";
import { type PublishStore, publishExtraction } from "@/lib/pipeline/publish";
import { SourceError } from "@/lib/sources";
import type { CampusEvent } from "@/lib/sources";
import {
  createCampusGroups,
  createUtdClubsEvents,
  normalizeClubEvent,
  parseIcsEvents,
} from "@/lib/sources/live/events";
import { mockEvents } from "@/lib/sources/mock/adapters";
import { Chaos } from "@/lib/sources/mock/chaos";

const NOW = new Date("2026-11-10T15:00:00Z");
const quiet = new Chaos({
  latencyMs: [0, 0],
  malformedRate: 0,
  timeoutRate: 0,
  rateLimitAtCall: 0,
  sleep: async () => {},
});
const ev = (over: Partial<CampusEvent> = {}): CampusEvent => ({
  source: "utdclubs",
  externalId: "e1",
  url: "https://x.example/e1",
  title: "Spring Hackathon",
  description: "Free. Prizes up to $2,000.",
  host: "HackUTD",
  location: "ECSW",
  start: "2026-12-05T10:00:00-06:00",
  end: "2026-12-06T10:00:00-06:00",
  ...over,
});

describe("classifyEvent", () => {
  it.each([
    ["HackUTD Winter Hackathon", "competition"],
    ["Finance Society Case Competition", "competition"],
    ["Startup Pitch Night", "competition"],
    ["Datathon 2027", "competition"],
    ["Capture the Flag", "competition"],
    ["General Body Meeting", "no"],
    ["End of Semester Social", "no"],
    ["Resume Workshop", "no"],
    ["Hackathon Info Session", "maybe"],
  ])("%s -> %s", (title, want) => expect(classifyEvent({ title, description: "" })).toBe(want));

  it("weak signals in the text are 'maybe', never an automatic yes", () => {
    expect(
      classifyEvent({
        title: "Innovation Challenge Kickoff",
        description: "Teams will compete for funding.",
      }),
    ).toBe("maybe");
    expect(classifyEvent({ title: "Movie Night", description: "Popcorn and a film." })).toBe("no");
  });
});

describe("eventToExtraction", () => {
  it("builds a publishable extraction from structured fields", () => {
    const x = eventToExtraction(ev());
    expect(x).toMatchObject({
      kind: "competition",
      title: "Spring Hackathon",
      host: "HackUTD",
      cost: "free",
      prize: "$2,000",
      format: "in_person",
      register_url: "https://x.example/e1",
    });
    expect(x.categories).toContain("hackathon");
    expect(x.stages).toEqual([
      {
        name: "Event day",
        starts_at: "2026-12-05T10:00:00-06:00",
        deadline_at: "2026-12-06T10:00:00-06:00",
      },
    ]);
    expect(x.confidence).toBeGreaterThanOrEqual(0.8);
  });
  it("detects virtual events and falls back to 'other' category", () => {
    expect(eventToExtraction(ev({ location: "Online (Zoom)" })).format).toBe("virtual");
    expect(categoriesFor("Knitting circle")).toEqual(["other"]);
  });
  it("actually publishes through the pipeline (confidence clears the review threshold)", async () => {
    const store = {
      publishCompetition: vi.fn(async () => ({ id: "c1", slug: "s" })),
      listOrgs: async () => [],
    } as unknown as PublishStore;
    const out = await publishExtraction(
      {
        extraction: eventToExtraction(ev()),
        dedupe: { action: "new", embedding: null, deferred: true },
        source: { source: "utdclubs", source_url: "https://x", external_id: "e1", posted_at: null },
      },
      store,
    );
    expect(out.outcome).toBe("published");
  });
});

function memoryStore() {
  const seen = new Map<string, string>();
  const store: IngestEventsStore = {
    knownIds: async (ids) => new Set(ids.filter((i) => seen.has(i))),
    record: async (r) => void seen.set(r.id, r.classification),
  };
  return { store, seen };
}
const sources = {
  utdclubs: mockEvents("utdclubs", quiet),
  campusgroups: mockEvents("campusgroups", quiet),
};

describe("runIngestEvents (mock fixtures)", () => {
  it("publishes the classified competitions, records the rest, and respects the 120-day window", async () => {
    const { store, seen } = memoryStore();
    const publish = vi.fn(async () => ({
      outcome: "published" as const,
      competition_id: "c",
      slug: "s",
      deferred_dedupe: false,
    }));
    const s = await runIngestEvents({ sources, store, publish, now: NOW });
    expect(
      publish.mock.calls.map((c) => (c as unknown as [unknown, CampusEvent])[1].title).sort(),
    ).toEqual([
      "Datathon 2027",
      "Finance Society Case Competition",
      "HackUTD Winter Hackathon",
      "Startup Pitch Night",
    ]);
    expect(s).toMatchObject({ published: 4, not_competitions: 3, maybe: 1, errors: 0 });
    expect(seen.get("utdclubs:evt-far-future")).toBeUndefined(); // outside the window: never fetched
    expect(seen.get("utdclubs:evt-gbm")).toBe("not_competition");
    expect(seen.get("campusgroups:cg-ambiguous")).toBeUndefined(); // undecided: looked at again tomorrow
  });

  it("a second run creates nothing new (every decided event is recorded)", async () => {
    const { store } = memoryStore();
    const publish = vi.fn(async () => ({
      outcome: "published" as const,
      competition_id: "c",
      slug: "s",
      deferred_dedupe: false,
    }));
    await runIngestEvents({ sources, store, publish, now: NOW });
    publish.mockClear();
    const again = await runIngestEvents({ sources, store, publish, now: NOW });
    expect(publish).not.toHaveBeenCalled();
    expect(again.skipped_known).toBe(7);
  });

  it("borderline events go to refine when one is provided", async () => {
    const { store } = memoryStore();
    const publish = vi.fn(async () => ({
      outcome: "published" as const,
      competition_id: "c",
      slug: "s",
      deferred_dedupe: false,
    }));
    const refine = vi.fn(async (e: CampusEvent) =>
      e.externalId === "cg-ambiguous" ? eventToExtraction(e) : null,
    );
    const s = await runIngestEvents({ sources, store, publish, refine, now: NOW });
    expect(refine).toHaveBeenCalledTimes(1);
    expect(s.published).toBe(5);
  });

  it("a source that fails is skipped with an alert and the other still runs; one bad event does not stop the rest", async () => {
    const { store } = memoryStore();
    const alert = vi.fn(async () => {});
    let n = 0;
    const publish = vi.fn(async () => {
      if (n++ === 0) throw new SourceError("groq", "unavailable");
      return {
        outcome: "published" as const,
        competition_id: "c",
        slug: "s",
        deferred_dedupe: false,
      };
    });
    const s = await runIngestEvents({
      sources: {
        utdclubs: sources.utdclubs,
        campusgroups: {
          fetchEvents: async () => {
            throw new SourceError("campusgroups", "malformed", "bad ics");
          },
        },
      },
      store,
      publish,
      now: NOW,
      alert,
    });
    expect(s.sources_failed).toEqual(["campusgroups"]);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("campusgroups"));
    expect(s.errors).toBe(1);
    expect(s.published).toBe(1);
  });
});

describe("live event adapters", () => {
  const res = (text: string, status = 200) =>
    ({ ok: status < 300, status, text: async () => text }) as Response;
  const range = { from: new Date("2026-11-10T00:00:00Z"), to: new Date("2027-03-10T00:00:00Z") };

  it("normalizes UTD Clubs events and rejects schema drift", async () => {
    expect(
      normalizeClubEvent({
        id: "a",
        name: "Hack",
        start_time: "2026-12-01T18:00:00Z",
        host: "ACM",
      }),
    ).toMatchObject({ source: "utdclubs", externalId: "a", host: "ACM" });
    expect(normalizeClubEvent({ nope: 1 })).toBeNull();
    const ok = createUtdClubsEvents({
      fetchImpl: (async () =>
        res(
          JSON.stringify({
            result: {
              data: { json: [{ id: "a", name: "Hack", start_time: "2026-12-01T18:00:00Z" }] },
            },
          }),
        )) as never,
    });
    expect(await ok.fetchEvents(range)).toHaveLength(1);
    const drift = createUtdClubsEvents({
      fetchImpl: (async () => res(JSON.stringify([{ x: 1 }, { y: 2 }, { z: 3 }]))) as never,
    });
    await expect(drift.fetchEvents(range)).rejects.toMatchObject({ kind: "malformed" });
    await expect(
      createUtdClubsEvents({ fetchImpl: (async () => res("{}", 503)) as never }).fetchEvents(range),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  const ICS = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\nBEGIN:VEVENT\r\nUID:cg-1\r\nSUMMARY:Robotics Competition\r\nDESCRIPTION:Build a robot.\r\nLOCATION:ECSW\r\nDTSTART:20261205T160000Z\r\nDTEND:20261205T220000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:cg-old\r\nSUMMARY:Old Event\r\nDTSTART:20200101T160000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

  it("parses an iCal feed, keeping only events inside the range", () => {
    const events = parseIcsEvents(ICS, range);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: "campusgroups",
      externalId: "cg-1",
      title: "Robotics Competition",
      location: "ECSW",
      start: "2026-12-05T16:00:00.000Z",
    });
    expect(() => parseIcsEvents("not a calendar", range)).toThrow(/invalid iCalendar/);
  });
  it("CampusGroups needs its feed URL configured and surfaces outages", async () => {
    await expect(createCampusGroups({}).fetchEvents(range)).rejects.toMatchObject({
      kind: "unavailable",
    });
    expect(
      await createCampusGroups({
        icalUrl: "https://x/feed.ics",
        fetchImpl: (async () => res(ICS)) as never,
      }).fetchEvents(range),
    ).toHaveLength(1);
    await expect(
      createCampusGroups({
        icalUrl: "https://x/feed.ics",
        fetchImpl: (async () => res("", 500)) as never,
      }).fetchEvents(range),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
});
