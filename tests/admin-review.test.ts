import { describe, expect, it, vi } from "vitest";
import { type ReviewDeps, type ReviewItem, resolveReviewItem } from "@/lib/admin/review";
import { loadFlyerCases } from "@/lib/fixtures";
import type { PublishStore } from "@/lib/pipeline/publish";

vi.mock("server-only", () => ({}));

const expected = loadFlyerCases().find(
  (c) => c.expected.kind === "competition" && c.expected.stages.length > 0,
)!.expected;
const lowConf = { ...expected, confidence: 0.55 };
const source = {
  source: "instagram",
  source_url: "https://ig/p/1",
  external_id: "ig1",
  posted_at: "2026-11-01T00:00:00Z",
  flyer_url: "https://i/x.jpg",
} as const;
const ID = "10000000-0000-4000-8000-000000000001";
const TARGET = "20000000-0000-4000-8000-000000000002";

function setup(item: Partial<ReviewItem> = {}) {
  const store = {
    publishCompetition: vi.fn<PublishStore["publishCompetition"]>(async () => ({
      id: "new-id",
      slug: "new-slug",
    })),
    getForMerge: vi.fn(async () => ({
      host_name: null,
      description: null,
      prize: null,
      location: null,
      register_url: null,
      flyer_url: null,
      categories: [],
      cost: "unknown",
      format: "unknown",
    })),
    mergeInto: vi.fn(async () => {}),
    applyStages: vi.fn(async () => false),
    addSource: vi.fn(async () => {}),
    findResultTarget: vi.fn(async () => null),
    listOrgs: vi.fn(async () => []),
    enqueueReview: vi.fn(async () => "r"),
  };
  const state = { open: true };
  const hide = vi.fn<ReviewDeps["hideCompetition"]>(async () => {});
  const deps: ReviewDeps = {
    getItem: async () => ({
      id: ID,
      kind: "low_confidence",
      status: state.open ? "open" : "done",
      payload: { extraction: lowConf, source },
      candidate_competition_id: null,
      ...item,
    }),
    resolve: vi.fn(async () => {
      if (!state.open) return false;
      state.open = false;
      return true;
    }),
    store: store as unknown as PublishStore,
    hideCompetition: hide,
    embedder: { embed: async () => [0.1, 0.2] },
    lookupSlug: async (id) => (id === TARGET ? "target-slug" : null),
  };
  return { deps, store, state, hide };
}

describe("resolveReviewItem", () => {
  it("approve publishes the extraction as a new listing and resolves the item", async () => {
    const { deps, store } = setup();
    const r = await resolveReviewItem(ID, { action: "approve" }, deps);
    expect(r).toMatchObject({ status: 200, body: { outcome: "published", slug: "new-slug" } });
    expect(store.publishCompetition).toHaveBeenCalledTimes(1);
    expect(store.publishCompetition.mock.calls[0][0].competition.confidence).toBe(0.9); // human vetted
    expect(deps.resolve).toHaveBeenCalledWith(ID, { action: "approve", competition_id: "new-id" });
  });

  it("edit applies the corrections before publishing", async () => {
    const { deps, store } = setup();
    const r = await resolveReviewItem(
      ID,
      { action: "edit", edits: { title: "Fixed Title", prize: "$500" } },
      deps,
    );
    expect(r.status).toBe(200);
    expect(store.publishCompetition.mock.calls[0][0].competition).toMatchObject({
      title: "Fixed Title",
      prize: "$500",
    });
  });

  it("merge attaches to the chosen listing instead of creating one", async () => {
    const { deps, store } = setup({ kind: "possible_duplicate" });
    const r = await resolveReviewItem(ID, { action: "merge", merge_into: TARGET }, deps);
    expect(r).toMatchObject({
      status: 200,
      body: { outcome: "merged", competition_id: TARGET, slug: "target-slug" },
    });
    expect(store.mergeInto).toHaveBeenCalledTimes(1);
    expect(store.publishCompetition).not.toHaveBeenCalled();
  });

  it("merge into a listing that no longer exists is a 422 and nothing is resolved", async () => {
    const { deps } = setup();
    const r = await resolveReviewItem(
      ID,
      { action: "merge", merge_into: "30000000-0000-4000-8000-000000000003" },
      deps,
    );
    expect(r.status).toBe(422);
    expect(deps.resolve).not.toHaveBeenCalled();
  });

  it("reject resolves without touching competitions", async () => {
    const { deps, store } = setup();
    const r = await resolveReviewItem(ID, { action: "reject" }, deps);
    expect(r).toMatchObject({ status: 200, body: { outcome: "rejected" } });
    expect(store.publishCompetition).not.toHaveBeenCalled();
    expect(store.mergeInto).not.toHaveBeenCalled();
  });

  it("an already-resolved item is a 409 and is never published twice", async () => {
    const { deps, store } = setup();
    await resolveReviewItem(ID, { action: "approve" }, deps);
    const again = await resolveReviewItem(ID, { action: "approve" }, deps);
    expect(again.status).toBe(409);
    expect(store.publishCompetition).toHaveBeenCalledTimes(1);
  });

  it("validates the action, the item and the payload", async () => {
    const { deps } = setup();
    expect((await resolveReviewItem(ID, { action: "explode" }, deps)).status).toBe(422);
    expect((await resolveReviewItem(ID, { action: "edit", edits: {} }, deps)).status).toBe(422);
    expect(
      (await resolveReviewItem(ID, { action: "merge", merge_into: "nope" }, deps)).status,
    ).toBe(422);
    expect(
      (await resolveReviewItem(ID, { action: "edit", edits: { register_url: "not a url" } }, deps))
        .status,
    ).toBe(422);
    expect(
      (await resolveReviewItem(ID, { action: "approve" }, { ...deps, getItem: async () => null }))
        .status,
    ).toBe(404);
    const bad = setup({ payload: { extraction: { nonsense: true }, source } });
    expect((await resolveReviewItem(ID, { action: "approve" }, bad.deps)).status).toBe(422);
  });

  it("refuses to approve an item with no dated round", async () => {
    const { deps } = setup({ payload: { extraction: { ...lowConf, stages: [] }, source } });
    expect((await resolveReviewItem(ID, { action: "approve" }, deps)).status).toBe(422);
  });
});

describe("post-hoc duplicates (listings published while embeddings were down)", () => {
  const postHoc = {
    post_hoc: {
      new_id: "40000000-0000-4000-8000-000000000004",
      new_title: "Newer",
      similarity: 0.9,
    },
  };

  it("Hide the newer one takes the new listing out of circulation and resolves the item", async () => {
    const { deps, hide } = setup({ kind: "possible_duplicate", payload: postHoc });
    const r = await resolveReviewItem(ID, { action: "hide_new" }, deps);
    expect(r.status).toBe(200);
    expect(hide).toHaveBeenCalledWith(postHoc.post_hoc.new_id);
    expect(deps.resolve).toHaveBeenCalledWith(ID, { action: "hide_new" });
  });

  it("Keep both resolves without hiding anything", async () => {
    const { deps, hide } = setup({ kind: "possible_duplicate", payload: postHoc });
    expect((await resolveReviewItem(ID, { action: "reject" }, deps)).status).toBe(200);
    expect(hide).not.toHaveBeenCalled();
  });

  it("publishing actions are refused (the listing is already public) and hide_new is refused elsewhere", async () => {
    const { deps, store } = setup({ kind: "possible_duplicate", payload: postHoc });
    for (const action of [
      { action: "approve" },
      { action: "merge", merge_into: TARGET },
      { action: "edit", edits: { title: "Fixed Title" } },
    ])
      expect((await resolveReviewItem(ID, action, deps)).status).toBe(422);
    expect(store.publishCompetition).not.toHaveBeenCalled();
    const normal = setup();
    expect((await resolveReviewItem(ID, { action: "hide_new" }, normal.deps)).status).toBe(422);
    expect(normal.hide).not.toHaveBeenCalled();
  });
});
