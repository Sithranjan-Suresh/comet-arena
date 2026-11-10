import { describe, expect, it, vi } from "vitest";
import { loadFlyerCases } from "@/lib/fixtures";
import { extractionSchema } from "@/lib/schemas";
import { SourceError } from "@/lib/sources";
import { mockClubs, mockFeed, mockInstagram, mockVision } from "@/lib/sources/mock/adapters";
import { Chaos } from "@/lib/sources/mock/chaos";
import { REPAIR_MARKER, mockFlyerUrl } from "@/lib/sources/mock/constants";

const noSleep = async () => {};
const calm = () => Chaos.none();

describe("Chaos", () => {
  it("is deterministic for a seed", async () => {
    const run = async () => {
      const c = new Chaos({ seed: 42, latencyMs: [0, 0], rateLimitAtCall: 0, sleep: noSleep });
      const out: string[] = [];
      for (let i = 0; i < 200; i++) out.push(await c.roll());
      return out;
    };
    expect(await run()).toEqual(await run());
  });

  it("injects about 10% malformed and 5% timeouts over many calls", async () => {
    const c = new Chaos({ seed: 7, latencyMs: [0, 0], rateLimitAtCall: 0, sleep: noSleep });
    const n: Record<string, number> = { ok: 0, malformed: 0, timeout: 0, rate_limit: 0 };
    for (let i = 0; i < 4000; i++) n[await c.roll()]++;
    expect(n.malformed / 4000).toBeGreaterThan(0.08);
    expect(n.malformed / 4000).toBeLessThan(0.12);
    expect(n.timeout / 4000).toBeGreaterThan(0.035);
    expect(n.timeout / 4000).toBeLessThan(0.065);
    expect(n.rate_limit).toBe(0);
  });

  it("returns exactly one 429, at the configured call number", async () => {
    const c = new Chaos({
      seed: 1,
      latencyMs: [0, 0],
      malformedRate: 0,
      timeoutRate: 0,
      rateLimitAtCall: 3,
      sleep: noSleep,
    });
    const outcomes: string[] = [];
    for (let i = 0; i < 10; i++) outcomes.push(await c.roll());
    expect(outcomes.filter((o) => o === "rate_limit")).toHaveLength(1);
    expect(outcomes[2]).toBe("rate_limit");
  });

  it("sleeps within the 1-4 s latency range", async () => {
    const sleep = vi.fn(async () => {});
    const c = new Chaos({ seed: 3, sleep, malformedRate: 0, timeoutRate: 0, rateLimitAtCall: 0 });
    for (let i = 0; i < 50; i++) await c.roll();
    for (const [ms] of sleep.mock.calls as unknown as [number][]) {
      expect(ms).toBeGreaterThanOrEqual(1000);
      expect(ms).toBeLessThanOrEqual(4000);
    }
  });

  it("can force any outcome and reads MOCK_CHAOS / MOCK_FAST from the environment", async () => {
    const forced = new Chaos({ force: "timeout", latencyMs: [0, 0], sleep: noSleep });
    expect(await forced.roll()).toBe("timeout");
    const off = Chaos.fromEnv({ MOCK_CHAOS: "off", MOCK_FAST: "1" });
    expect(off.opts.latencyMs).toEqual([0, 0]);
    expect(off.opts.malformedRate).toBe(0);
    expect(off.opts.rateLimitAtCall).toBe(0);
  });
});

describe("mock vision", () => {
  const first = loadFlyerCases()[0];
  const input = { system: "s", user: "extract", images: [mockFlyerUrl(first.images[0])] };

  it("answers with the canned extraction for a known flyer", async () => {
    const out = await mockVision(calm()).complete(input);
    expect(extractionSchema.parse(JSON.parse(out))).toMatchObject({ title: first.expected.title });
  });

  it("finds a carousel by any of its images", async () => {
    const carousel = loadFlyerCases().find((c) => c.images.length > 1)!;
    const out = await mockVision(calm()).complete({
      ...input,
      images: [mockFlyerUrl(carousel.images[1])],
    });
    expect(JSON.parse(out).title).toBe(carousel.expected.title);
  });

  it("returns a low-confidence non-competition for unknown input", async () => {
    const out = JSON.parse(
      await mockVision(calm()).complete({ system: "s", user: "nothing", images: ["x.png"] }),
    );
    expect(out).toMatchObject({ kind: "not_competition" });
  });

  it("injects malformed JSON, but never on a repair call", async () => {
    const chaos = () => new Chaos({ force: "malformed", latencyMs: [0, 0], sleep: noSleep });
    const bad = await mockVision(chaos()).complete(input);
    expect(() => JSON.parse(bad)).toThrow();
    const repaired = await mockVision(chaos()).complete({
      ...input,
      user: `${REPAIR_MARKER}: fix it`,
    });
    expect(() => JSON.parse(repaired)).not.toThrow();
  });

  it("raises typed errors for timeouts and rate limits", async () => {
    const t = new Chaos({ force: "timeout", latencyMs: [0, 0], sleep: noSleep });
    await expect(mockVision(t).complete(input)).rejects.toMatchObject({ kind: "timeout" });
    const r = new Chaos({ force: "rate_limit", latencyMs: [0, 0], sleep: noSleep });
    await expect(mockVision(r).complete(input)).rejects.toBeInstanceOf(SourceError);
  });
});

describe("mock instagram, feeds and clubs", () => {
  it("returns a handle's posts newest first, with mock flyer URLs", async () => {
    const res = await mockInstagram(calm()).fetchRecentPosts("ais_utd_sample");
    if (res.status !== "ok") throw new Error("expected ok");
    expect(res.posts.length).toBeGreaterThan(0);
    const times = res.posts.map((p) => p.postedAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(res.posts[0].mediaUrls[0]).toMatch(/^mock:\/\/flyers\//);
  });

  it("reports no_account for unknown handles and honors the limit", async () => {
    expect(await mockInstagram(calm()).fetchRecentPosts("nobody")).toEqual({
      status: "no_account",
    });
    const res = await mockInstagram(calm()).fetchRecentPosts("hackutd_sample", { limit: 1 });
    if (res.status !== "ok") throw new Error("expected ok");
    expect(res.posts).toHaveLength(1);
  });

  it("marks carousel posts", async () => {
    const res = await mockInstagram(calm()).fetchRecentPosts("design_guild_sample");
    if (res.status !== "ok") throw new Error("expected ok");
    expect(
      res.posts.some((p) => p.mediaType === "CAROUSEL_ALBUM" && p.mediaUrls.length === 2),
    ).toBe(true);
  });

  it("serves devpost listings, an empty MLH feed and the club snapshot", async () => {
    expect(await mockFeed("devpost", calm()).fetchListings()).toHaveLength(2);
    expect(await mockFeed("mlh", calm()).fetchListings()).toEqual([]);
    expect((await mockClubs(calm()).fetchClubs()).length).toBe(30);
  });

  it("propagates injected failures from every adapter", async () => {
    const boom = () => new Chaos({ force: "timeout", latencyMs: [0, 0], sleep: noSleep });
    await expect(mockInstagram(boom()).fetchRecentPosts("ais_utd_sample")).rejects.toMatchObject({
      kind: "timeout",
    });
    await expect(mockFeed("devpost", boom()).fetchListings()).rejects.toMatchObject({
      kind: "timeout",
    });
    await expect(mockClubs(boom()).fetchClubs()).rejects.toMatchObject({ kind: "timeout" });
  });
});
