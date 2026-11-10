import { describe, expect, it, vi } from "vitest";
import {
  type IgOrg,
  type IngestInstagramStore,
  runIngestInstagram,
} from "@/lib/jobs/ingest-instagram";
import type { IngestResult } from "@/lib/pipeline/ingest-post";
import { SourceError } from "@/lib/sources";
import { ApifyCreditsExhausted } from "@/lib/sources/live/apify";
import type { IgPost } from "@/lib/sources";

const post = (id: string, at = "2026-11-05T10:00:00.000Z"): IgPost => ({
  id,
  caption: id,
  permalink: `https://ig/${id}`,
  postedAt: at,
  mediaType: "IMAGE",
  mediaUrls: ["https://i/x.jpg"],
});
const org = (id: string, t: IgOrg["ig_account_type"] = "business"): IgOrg => ({
  id,
  name: id,
  ig_handle: `${id}_ig`,
  ig_account_type: t,
});
const comp: IngestResult = { class: "competition", competitionId: "c1", outcome: "published" };

function setup(orgs: IgOrg[], over: Partial<Parameters<typeof runIngestInstagram>[0]> = {}) {
  const known = new Set<string>();
  const recorded: string[] = [];
  const types = new Map<string, string>();
  const store: IngestInstagramStore = {
    listOrgs: async () => orgs,
    knownPostIds: async (ids) => new Set(ids.filter((i) => known.has(i))),
    recordPost: async ({ post: p }) => void (known.add(p.id), recorded.push(p.id)),
    setAccountType: async (id, t) => void types.set(id, t),
  };
  const processPost = vi.fn(async () => comp);
  const sleep = vi.fn(async () => {});
  const instagram = {
    fetchRecentPosts: vi.fn(async (h: string) => ({
      status: "ok" as const,
      posts: [post(`${h}-1`), post(`${h}-2`, "2026-11-04T10:00:00.000Z")],
    })),
  };
  return {
    store,
    processPost,
    sleep,
    instagram,
    recorded,
    types,
    known,
    run: () => runIngestInstagram({ store, instagram, processPost, sleep, ...over }),
  };
}

describe("runIngestInstagram", () => {
  it("processes new posts oldest-first with 2s spacing between orgs", async () => {
    const t = setup([org("a"), org("b")]);
    const s = await t.run();
    expect(s).toMatchObject({ orgs: 2, posts_new: 4, published: 4, incomplete: false });
    expect(t.recorded.slice(0, 2)).toEqual(["a_ig-2", "a_ig-1"]);
    expect(t.sleep).toHaveBeenCalledWith(2000);
  });

  it("running twice creates no duplicates (known posts are skipped)", async () => {
    const t = setup([org("a")]);
    await t.run();
    const second = await t.run();
    expect(t.processPost).toHaveBeenCalledTimes(2);
    expect(second).toMatchObject({ posts_new: 0, skipped_known: 2 });
  });

  it("an infrastructure failure on a post is not recorded, so it is retried", async () => {
    const t = setup([org("a")]);
    t.processPost.mockRejectedValueOnce(new SourceError("groq", "unavailable"));
    const s = await t.run();
    expect(s.errors).toBe(1);
    expect(t.recorded).toHaveLength(1);
  });

  it("quota stop ends the run incomplete and resume continues after the last finished org", async () => {
    const t = setup([org("a"), org("b"), org("c")]);
    t.instagram.fetchRecentPosts.mockImplementation(async (h: string) => {
      if (h === "b_ig") throw new SourceError("instagram", "rate_limit");
      return { status: "ok" as const, posts: [post(`${h}-1`)] };
    });
    const checkpoint = vi.fn(async () => {});
    const s = await runIngestInstagram({
      store: t.store,
      instagram: t.instagram,
      processPost: t.processPost,
      sleep: t.sleep,
      checkpoint,
    });
    expect(s).toMatchObject({ stopped: "quota", incomplete: true, orgs: 2 });
    expect(checkpoint).toHaveBeenLastCalledWith("a");
    t.instagram.fetchRecentPosts.mockImplementation(async (h: string) => ({
      status: "ok" as const,
      posts: [post(`${h}-1`)],
    }));
    const resumed = await runIngestInstagram({
      store: t.store,
      instagram: t.instagram,
      processPost: t.processPost,
      sleep: t.sleep,
      resumeAfter: "a",
    });
    expect(resumed.orgs).toBe(2); // b and c
    expect(resumed.incomplete).toBe(false);
  });

  it("stops at the time budget and marks the run incomplete", async () => {
    let clock = 0;
    const t = setup([org("a"), org("b")], { now: () => clock, budgetMs: 1000 });
    t.sleep.mockImplementation(async () => void (clock += 2000));
    const s = await t.run();
    expect(s).toMatchObject({ stopped: "budget", incomplete: true, orgs: 1 });
  });

  it("an unknown account with no Business Discovery access becomes personal and goes to Apify in one batch", async () => {
    const apify = { fetchBatch: vi.fn(async () => new Map([["p_ig", [post("p-1")]]])) };
    const t = setup([org("p", "unknown"), org("q", "personal_or_missing")], { apify });
    t.instagram.fetchRecentPosts.mockResolvedValue({ status: "no_account" } as never);
    const s = await t.run();
    expect(t.types.get("p")).toBe("personal_or_missing");
    expect(apify.fetchBatch).toHaveBeenCalledTimes(1);
    expect(apify.fetchBatch).toHaveBeenCalledWith(["p_ig", "q_ig"]);
    expect(s).toMatchObject({ personal_queued: 2, posts_new: 1 });
  });

  it("Apify credit exhaustion alerts the admin and skips personal accounts without failing", async () => {
    const alert = vi.fn(async () => {});
    const apify = {
      fetchBatch: vi.fn(async () => {
        throw new ApifyCreditsExhausted();
      }),
    };
    const t = setup([org("q", "personal_or_missing")], { apify, alert });
    const s = await t.run();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("Apify"));
    expect(s.stopped).toBe("apify_credits");
  });

  it("a business account that works is marked business; one org failing does not stop the rest", async () => {
    const t = setup([org("a", "unknown"), org("b")]);
    t.instagram.fetchRecentPosts.mockImplementationOnce(async () => {
      throw new SourceError("instagram", "unavailable");
    });
    const s = await t.run();
    expect(s.errors).toBe(1);
    expect(s.orgs).toBe(2);
    expect(t.recorded.length).toBeGreaterThan(0);
  });
});
