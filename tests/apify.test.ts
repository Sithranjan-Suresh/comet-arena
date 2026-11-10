import { describe, expect, it, vi } from "vitest";
import { ApifyCreditsExhausted, createApify, itemToPost } from "@/lib/sources/live/apify";

const res = (body: unknown, status = 200, text = "") =>
  ({ ok: status < 300, status, json: async () => body, text: async () => text }) as Response;
const mk = (f: unknown, timeoutMs?: number) =>
  createApify({ token: "t", fetchImpl: f as typeof fetch, timeoutMs });
const item = (over = {}) => ({
  id: "1",
  ownerUsername: "Club_One",
  caption: "hi",
  url: "https://www.instagram.com/p/X/",
  displayUrl: "https://i/x.jpg",
  timestamp: "2026-11-05T10:00:00.000Z",
  type: "Image",
  ...over,
});

describe("apify fallback", () => {
  it("groups posts by lowercased owner and posts one batch request", async () => {
    const f = vi.fn(async () =>
      res([
        item(),
        item({ id: "2" }),
        item({ id: "3", ownerUsername: "other", type: "Sidecar", images: ["https://i/1.jpg"] }),
      ]),
    );
    const out = await mk(f).fetchBatch(["@Club_One", "other"]);
    expect(out.get("club_one")).toHaveLength(2);
    expect(out.get("other")![0]).toMatchObject({
      mediaType: "CAROUSEL_ALBUM",
      mediaUrls: ["https://i/x.jpg", "https://i/1.jpg"],
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body).directUrls[0],
    ).toBe("https://www.instagram.com/Club_One/");
  });

  it("skips error and malformed rows; empty input makes no request", async () => {
    const f = vi.fn(async () =>
      res([{ error: "private", ownerUsername: "p" }, item({ timestamp: "nope" })]),
    );
    expect((await mk(f).fetchBatch(["a"])).size).toBe(0);
    const g = vi.fn();
    expect((await mk(g).fetchBatch([])).size).toBe(0);
    expect(g).not.toHaveBeenCalled();
    expect(itemToPost({})).toBeNull();
  });

  it("credit exhaustion (402, or 403 mentioning usage) is a distinct error for admin alerts", async () => {
    await expect(mk(async () => res({}, 402)).fetchBatch(["a"])).rejects.toBeInstanceOf(
      ApifyCreditsExhausted,
    );
    await expect(
      mk(async () => res({}, 403, "Monthly usage hard limit exceeded")).fetchBatch(["a"]),
    ).rejects.toBeInstanceOf(ApifyCreditsExhausted);
    await expect(mk(async () => res({}, 403, "bad token")).fetchBatch(["a"])).rejects.toMatchObject(
      { kind: "unavailable" },
    );
  });

  it("aborts after the timeout", async () => {
    const f = (_u: string, init: { signal: AbortSignal }) =>
      new Promise((_r, rej) =>
        init.signal.addEventListener("abort", () =>
          rej(Object.assign(new Error("a"), { name: "AbortError" })),
        ),
      );
    await expect(mk(f, 20).fetchBatch(["a"])).rejects.toMatchObject({ kind: "timeout" });
  });

  it("maps outages, rate limits and bad bodies to typed errors", async () => {
    await expect(mk(async () => res({}, 500)).fetchBatch(["a"])).rejects.toMatchObject({
      kind: "unavailable",
    });
    await expect(mk(async () => res({}, 429)).fetchBatch(["a"])).rejects.toMatchObject({
      kind: "rate_limit",
    });
    await expect(mk(async () => res({ not: "list" })).fetchBatch(["a"])).rejects.toMatchObject({
      kind: "malformed",
    });
    await expect(
      mk(async () => {
        throw new Error("net");
      }).fetchBatch(["a"]),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
});
