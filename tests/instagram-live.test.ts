import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  QUOTA_STOP,
  createInstagramBusinessDiscovery,
  parseUsage,
} from "@/lib/sources/live/instagram";

const fx = (n: string) => JSON.parse(readFileSync(`fixtures/instagram/${n}.json`, "utf8"));
const res = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  ({ ok: status < 300, status, headers: new Headers(headers), json: async () => body }) as Response;
const mk = (f: unknown, extra = {}) =>
  createInstagramBusinessDiscovery({
    userId: "1",
    accessToken: "tok",
    fetchImpl: f as typeof fetch,
    sleep: async () => {},
    ...extra,
  });

describe("instagram Business Discovery adapter (recorded fixtures)", () => {
  it("normalizes posts, carousel children and video thumbnails; drops malformed rows", async () => {
    const f = vi.fn(async () => res(fx("business-discovery-ok")));
    const out = await mk(f).fetchRecentPosts("@ais_utd");
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.posts.map((p) => p.id)).toEqual([
      "17900000000000001",
      "17900000000000002",
      "17900000000000003",
    ]);
    expect(out.posts[1].mediaUrls).toHaveLength(3);
    expect(out.posts[2].mediaUrls).toEqual(["https://scontent.cdninstagram.com/c.jpg"]);
    expect(out.posts[0].postedAt).toBe("2026-11-05T18:30:00.000Z");
    const url = decodeURIComponent((f.mock.calls[0] as unknown as string[])[0]);
    expect(url).toContain("business_discovery.username(ais_utd){media.limit(10)");
    expect(url).toContain("children{media_url}");
  });

  it("not a business account / unknown user is no_account, not an error", async () => {
    expect(
      await mk(async () => res(fx("error-no-account"), 400)).fetchRecentPosts("nobody"),
    ).toEqual({ status: "no_account" });
  });

  it("rejects unsafe handles without calling the API", async () => {
    const f = vi.fn();
    expect(await mk(f).fetchRecentPosts("bad handle){x}")).toEqual({ status: "no_account" });
    expect(f).not.toHaveBeenCalled();
  });

  it("retries rate limits with exponential backoff then gives up", async () => {
    const sleep = vi.fn(async () => {});
    const f = vi.fn(async () => res({ error: { code: 4, message: "limit" } }, 400));
    await expect(mk(f, { sleep, retries: 2 }).fetchRecentPosts("a")).rejects.toMatchObject({
      kind: "rate_limit",
    });
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => (c as unknown as number[])[0])).toEqual([1000, 2000]);
  });

  it("recovers when a retry succeeds", async () => {
    let n = 0;
    const f = vi.fn(async () => (n++ === 0 ? res({}, 503) : res(fx("business-discovery-ok"))));
    expect((await mk(f).fetchRecentPosts("a")).status).toBe("ok");
  });

  it("a 20 s timeout aborts the request, is retried with backoff, and surfaces as a timeout (the run retries tomorrow)", async () => {
    const f = vi.fn(
      (_u: string, init: { signal: AbortSignal }) =>
        new Promise((_r, rej) =>
          init.signal.addEventListener("abort", () =>
            rej(Object.assign(new Error("a"), { name: "AbortError" })),
          ),
        ),
    );
    await expect(mk(f, { timeoutMs: 10, retries: 1 }).fetchRecentPosts("a")).rejects.toMatchObject({
      kind: "timeout",
    });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("an expired token fails fast without retrying", async () => {
    const f = vi.fn(async () => res({ error: { code: 190, message: "expired" } }, 400));
    await expect(mk(f).fetchRecentPosts("a")).rejects.toThrow(/token/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("stops once app usage reaches 80%", async () => {
    const seen: number[] = [];
    const f = vi.fn(async () =>
      res(fx("business-discovery-ok"), 200, {
        "x-app-usage": '{"call_count":81,"total_time":5,"total_cputime":2}',
      }),
    );
    const ig = mk(f, { onUsage: (p: number) => seen.push(p) });
    await ig.fetchRecentPosts("a");
    expect(seen).toEqual([81]);
    await expect(ig.fetchRecentPosts("b")).rejects.toMatchObject({ kind: "rate_limit" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(QUOTA_STOP).toBe(80);
  });

  it("parses usage headers defensively", () => {
    expect(parseUsage(new Headers({ "x-app-usage": '{"call_count":10,"total_time":42}' }))).toBe(
      42,
    );
    expect(
      parseUsage(
        new Headers({
          "x-business-use-case-usage":
            '{"1":[{"call_count":7,"estimated_time_to_regain_access":999}]}',
        }),
      ),
    ).toBe(7);
    expect(parseUsage(new Headers({ "x-app-usage": "garbage" }))).toBe(0);
    expect(parseUsage(new Headers())).toBe(0);
  });
});
