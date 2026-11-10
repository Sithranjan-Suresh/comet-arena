import { describe, expect, it, vi } from "vitest";
import { runIngestFeeds } from "@/lib/jobs/ingest-feeds";
import { SourceError } from "@/lib/sources";
import { Chaos } from "@/lib/sources/mock/chaos";
import { mockFeed } from "@/lib/sources/mock/adapters";
import type { FeedListing } from "@/lib/sources";
import { createDevpost, createMlh, isDfwOrVirtual, parseMlhEvents } from "@/lib/sources/live/feeds";

const l = (source: "devpost" | "mlh", id: string): FeedListing => ({
  source,
  externalId: id,
  url: `https://x/${id}`,
  title: id,
  text: id,
  postedAt: "2026-11-01T00:00:00Z",
});
const ok = { class: "competition", competitionId: "c", outcome: "published" } as const;

describe("runIngestFeeds", () => {
  it("mock fixtures flow through to published listings (skipping known ones)", async () => {
    const chaos = new Chaos({
      latencyMs: [0, 0],
      malformedRate: 0,
      timeoutRate: 0,
      rateLimitAtCall: 0,
      sleep: async () => {},
    });
    const sources = { devpost: mockFeed("devpost", chaos), mlh: mockFeed("mlh", chaos) };
    const process = vi.fn(async () => ok);
    const s = await runIngestFeeds({
      feeds: { devpost: sources.devpost, mlh: sources.mlh },
      store: {
        knownExternalIds: async (src, ids) => new Set(src === "devpost" ? ids.slice(0, 1) : []),
      },
      processListing: process,
    });
    expect(s.fetched).toBeGreaterThan(1);
    expect(s.skipped_known).toBe(1);
    expect(s.published).toBe(s.new);
    expect(process).toHaveBeenCalled();
  });

  it("a feed that fails to parse is skipped with an alert while the other feed still runs", async () => {
    const alert = vi.fn(async () => {});
    const s = await runIngestFeeds({
      feeds: {
        devpost: {
          fetchListings: async () => {
            throw new SourceError("devpost", "malformed", "bad json");
          },
        },
        mlh: { fetchListings: async () => [l("mlh", "m1")] },
      },
      store: { knownExternalIds: async () => new Set() },
      processListing: async () => ok,
      alert,
    });
    expect(s).toMatchObject({ feeds_failed: ["devpost"], new: 1, published: 1 });
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("devpost"));
  });

  it("one listing failing does not stop the rest", async () => {
    let n = 0;
    const s = await runIngestFeeds({
      feeds: {
        devpost: { fetchListings: async () => [l("devpost", "a"), l("devpost", "b")] },
        mlh: { fetchListings: async () => [] },
      },
      store: { knownExternalIds: async () => new Set() },
      processListing: async () => {
        if (n++ === 0) throw new SourceError("groq", "unavailable");
        return ok;
      },
    });
    expect(s).toMatchObject({ errors: 1, published: 1 });
  });
});

describe("live feed adapters", () => {
  const res = (body: unknown, text = "", status = 200) =>
    ({ ok: status < 300, status, json: async () => body, text: async () => text }) as Response;

  it("region filter keeps DFW and virtual", () => {
    expect(isDfwOrVirtual("Richardson, TX")).toBe(true);
    expect(isDfwOrVirtual("Online")).toBe(true);
    expect(isDfwOrVirtual("Boston, MA")).toBe(false);
  });

  it("devpost: maps listings to text, filters regions, stops on an empty page", async () => {
    const page = {
      hackathons: [
        {
          id: 1,
          title: "DFW Hack",
          url: "https://d/1",
          displayed_location: { location: "Dallas, TX" },
          submission_period_dates: "Jan 1 - Jan 3, 2027",
          prize_amount: "$<span>5,000</span>",
        },
        {
          id: 2,
          title: "Boston Hack",
          url: "https://d/2",
          displayed_location: { location: "Boston, MA" },
        },
        { id: 3, title: "Global", url: "https://d/3", displayed_location: { location: "Online" } },
      ],
    };
    const f = vi.fn(async (u: string) => res(u.includes("page=1") ? page : { hackathons: [] }));
    const out = await createDevpost({ fetchImpl: f as never }).fetchListings();
    expect(out.map((x) => x.externalId)).toEqual(["1", "3"]);
    expect(out[0].text).toContain("Prizes: $ 5,000");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("devpost: bad bodies and outages are typed errors", async () => {
    await expect(
      createDevpost({ fetchImpl: (async () => res({ nope: 1 })) as never }).fetchListings(),
    ).rejects.toMatchObject({ kind: "malformed" });
    await expect(
      createDevpost({ fetchImpl: (async () => res({}, "", 503)) as never }).fetchListings(),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  const html = `<div itemscope itemtype="http://schema.org/Event"><a href="https://mlh.io/e/hackutd"><h3 itemprop="name">HackUTD</h3></a><meta itemprop="startDate" content="2027-02-01"/><meta itemprop="endDate" content="2027-02-02"/><span itemprop="city">Richardson</span><span itemprop="state">TX</span></div>
  <div itemscope itemtype="http://schema.org/Event"><a href="https://mlh.io/e/far"><h3 itemprop="name">FarHack</h3></a><span itemprop="city">Boston</span><span itemprop="state">MA</span></div>`;

  it("mlh: parses microdata and filters to DFW", async () => {
    expect(parseMlhEvents(html)).toHaveLength(2);
    const out = await createMlh({
      fetchImpl: (async () => res(null, html)) as never,
    }).fetchListings();
    expect(out.map((x) => x.title)).toEqual(["HackUTD"]);
    expect(out[0].text).toContain("Richardson, TX");
  });

  it("mlh: a page with no parsable events is a loud malformed error", async () => {
    await expect(
      createMlh({
        fetchImpl: (async () => res(null, "<html><body>new layout</body></html>")) as never,
      }).fetchListings(),
    ).rejects.toMatchObject({ kind: "malformed" });
  });
});
