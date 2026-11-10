import { describe, expect, it } from "vitest";
import type { ExistingCompetition } from "@/lib/dedupe";
import type { PublishStore } from "@/lib/pipeline/publish";
import {
  type ConfirmDeps,
  type SubmissionRecord,
  confirmInputSchema,
  confirmSubmission,
  extractionFromConfirm,
} from "@/lib/submit/confirm";
import { publicFlyerUrl } from "@/lib/submit/server";
import { mockEmbedder } from "@/lib/sources/mock/embedder";

const U = "00000000-0000-4000-8000-0000000000a1";
const SUB = "00000000-0000-4000-8000-0000000000b1";
const EXISTING = "00000000-0000-4000-8000-0000000000c1";
const NOW = new Date("2026-11-10T15:00:00Z");

const valid = {
  title: "AIS Fall Case Competition",
  host: "AIS",
  categories: ["case_competition"],
  description: "Solve a case.",
  stages: [
    { name: "Registration closes", deadline_at: "2026-11-21T05:59:00Z" },
    { name: "Finals", starts_at: "2026-12-05T15:00:00Z", deadline_at: "2026-12-05T23:00:00Z" },
  ],
  eligibility: { majors: ["Accounting"], class_years: [], team_min: 3, team_max: 4 },
  prize: "$2,500",
  cost: "free",
  format: "in_person",
  location: "JSOM",
  register_url: "https://example.com/r",
  no_link_yet: false,
};

describe("confirmInputSchema (spec CL-2: title, a dated round, a link or 'no link yet')", () => {
  const issues = (over: object) => {
    const r = confirmInputSchema.safeParse({ ...valid, ...over });
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  };

  it("accepts a complete submission", () => expect(issues({})).toEqual([]));
  it("requires a title", () => expect(issues({ title: " " })[0]).toMatch(/title/i));
  it("requires at least one round with a date", () => {
    expect(issues({ stages: [] })[0]).toMatch(/at least one round/);
    expect(issues({ stages: [{ name: "x", deadline_at: "tomorrow" }] }).length).toBeGreaterThan(0);
  });
  it("requires a register link OR the 'no link yet' box", () => {
    expect(issues({ register_url: null })[0]).toMatch(/registration link/);
    expect(issues({ register_url: null, no_link_yet: true })).toEqual([]);
    expect(issues({ register_url: "javascript:alert(1)" }).length).toBeGreaterThan(0);
    expect(issues({ register_url: "not a url" }).length).toBeGreaterThan(0);
  });
  it("requires a category and sane team sizes and round order", () => {
    expect(issues({ categories: [] })[0]).toMatch(/category/);
    expect(issues({ eligibility: { team_min: 5, team_max: 2 } })[0]).toMatch(/team size/);
    expect(
      issues({
        stages: [
          { name: "x", starts_at: "2026-12-06T00:00:00Z", deadline_at: "2026-12-05T00:00:00Z" },
        ],
      })[0],
    ).toMatch(/cannot start after/);
  });
});

describe("extractionFromConfirm", () => {
  it("builds a schema-valid competition extraction with sorted stages and a high human-reviewed confidence", () => {
    const ex = extractionFromConfirm(
      confirmInputSchema.parse({ ...valid, stages: [...valid.stages].reverse() }),
    );
    expect(ex).toMatchObject({
      kind: "competition",
      title: "AIS Fall Case Competition",
      confidence: 0.9,
    });
    expect(ex.stages.map((s) => s.name)).toEqual(["Registration closes", "Finals"]);
  });
  it("lists the register link as missing when the student ticked 'no link yet'", () => {
    const ex = extractionFromConfirm(
      confirmInputSchema.parse({ ...valid, register_url: null, no_link_yet: true }),
    );
    expect(ex.register_url).toBeNull();
    expect(ex.missing_fields).toContain("register_url");
  });
});

class Store implements PublishStore {
  published: Parameters<PublishStore["publishCompetition"]>[0][] = [];
  merged: { id: string; patch: Partial<ExistingCompetition>; source: unknown }[] = [];
  stageUpdates: string[] = [];
  async publishCompetition(i: Parameters<PublishStore["publishCompetition"]>[0]) {
    this.published.push(i);
    return { id: "new-comp", slug: "ais-fall-case-competition" };
  }
  async getForMerge(): Promise<ExistingCompetition> {
    return {
      host_name: "AIS",
      description: null,
      prize: null,
      location: null,
      register_url: null,
      flyer_url: null,
      categories: [],
      cost: "unknown",
      format: "unknown",
    };
  }
  async mergeInto(id: string, patch: Partial<ExistingCompetition>, source: unknown) {
    this.merged.push({ id, patch, source });
  }
  async addSource() {}
  async applyStages(id: string) {
    this.stageUpdates.push(id);
    return false;
  }
  async findResultTarget() {
    return null;
  }
  async listOrgs() {
    return [{ id: "org-ais", name: "Association for Information Systems (AIS)", slug: "ais" }];
  }
  async enqueueReview() {
    return "r1";
  }
}

function setup(sub: Partial<SubmissionRecord> | null = {}) {
  const store = new Store();
  const done: unknown[] = [];
  const deps: ConfirmDeps = {
    getSubmission: async (id, userId) =>
      sub === null || id !== SUB || userId !== U
        ? null
        : {
            id: SUB,
            user_id: U,
            raw_url: "https://ig.example/p/1",
            image_path: `storage:flyers/submissions/${U}/f.jpg`,
            status: "pending",
            competition_id: null,
            merged_into: null,
            ...sub,
          },
    store,
    embedder: mockEmbedder(),
    lookupSlug: async (id) =>
      id === EXISTING ? "existing-comp" : id === "new-comp" ? "ais-fall-case-competition" : null,
    markDone: async (_id, patch) => void done.push(patch),
    flyerUrl: (p) => publicFlyerUrl(p, "https://proj.supabase.co"),
    now: NOW,
  };
  return { deps, store, done };
}

describe("confirmSubmission", () => {
  it("publishes a new unverified competition crediting the submitter, with the flyer and host org", async () => {
    const { deps, store, done } = setup();
    const r = await confirmSubmission(SUB, U, valid, deps);
    expect(r).toEqual({
      status: 200,
      body: { competition_slug: "ais-fall-case-competition", outcome: "published" },
    });
    const pub = store.published[0];
    expect(pub.competition).toMatchObject({
      status: "unverified",
      created_by: U,
      host_org_id: "org-ais",
      flyer_url: `https://proj.supabase.co/storage/v1/object/public/flyers/submissions/${U}/f.jpg`,
    });
    expect(pub.sources[0]).toMatchObject({
      source: "submission",
      external_id: `submission:${SUB}`,
      source_url: "https://ig.example/p/1",
    });
    expect(pub.stages).toHaveLength(2);
    expect(done).toEqual([{ status: "published", competition_id: "new-comp" }]);
  });

  it("merge_into adds a confirmation to the existing listing instead of creating a duplicate", async () => {
    const { deps, store, done } = setup();
    const r = await confirmSubmission(SUB, U, { ...valid, merge_into: EXISTING }, deps);
    expect(r).toEqual({
      status: 200,
      body: { competition_slug: "existing-comp", outcome: "merged" },
    });
    expect(store.published).toHaveLength(0);
    expect(store.merged[0]).toMatchObject({
      id: EXISTING,
      patch: { prize: "$2,500", register_url: "https://example.com/r" },
    });
    expect(store.merged[0].patch).not.toHaveProperty("host_name"); // already known: never overwritten
    expect(store.stageUpdates).toEqual([EXISTING]);
    expect(done).toEqual([{ status: "merged", merged_into: EXISTING }]);
  });

  it("rejects a merge target that no longer exists", async () => {
    const r = await confirmSubmission(
      SUB,
      U,
      { ...valid, merge_into: "00000000-0000-4000-8000-0000000000ff" },
      setup().deps,
    );
    expect(r).toMatchObject({ status: 422, body: { issues: [{ path: "merge_into" }] } });
  });

  it("returns field-level errors for invalid input without touching anything", async () => {
    const { deps, store } = setup();
    const r = await confirmSubmission(SUB, U, { ...valid, title: "", stages: [] }, deps);
    expect(r.status).toBe(422);
    if (r.status === 422)
      expect(r.body.issues.map((i) => i.path)).toEqual(expect.arrayContaining(["title", "stages"]));
    expect(store.published).toHaveLength(0);
  });

  it("refuses competitions that already ended", async () => {
    const r = await confirmSubmission(
      SUB,
      U,
      { ...valid, stages: [{ name: "Old", deadline_at: "2026-10-01T00:00:00Z" }] },
      setup().deps,
    );
    expect(r).toMatchObject({
      status: 422,
      body: { issues: [{ path: "stages", message: expect.stringContaining("already ended") }] },
    });
  });

  it("only the owner can confirm: other users and unknown ids get 404", async () => {
    expect(
      await confirmSubmission(SUB, "00000000-0000-4000-8000-00000000dead", valid, setup().deps),
    ).toMatchObject({ status: 404 });
    expect(await confirmSubmission(SUB, U, valid, setup(null).deps)).toMatchObject({ status: 404 });
  });

  it("is idempotent: confirming twice returns the existing result and publishes once", async () => {
    const { deps, store } = setup({ status: "published", competition_id: "new-comp" });
    const r = await confirmSubmission(SUB, U, valid, deps);
    expect(r).toEqual({
      status: 200,
      body: { competition_slug: "ais-fall-case-competition", outcome: "published" },
    });
    expect(store.published).toHaveLength(0);
  });

  it("explains queued and otherwise-handled submissions with 409", async () => {
    expect(await confirmSubmission(SUB, U, valid, setup({ status: "queued" }).deps)).toMatchObject({
      status: 409,
      body: { message: expect.stringContaining("still reading") },
    });
    expect(
      await confirmSubmission(SUB, U, valid, setup({ status: "rejected" }).deps),
    ).toMatchObject({ status: 409 });
  });
});

describe("publicFlyerUrl", () => {
  it("maps storage refs to public URLs and refuses anything else", () => {
    expect(publicFlyerUrl("storage:flyers/a/b.jpg", "https://p.supabase.co/")).toBe(
      "https://p.supabase.co/storage/v1/object/public/flyers/a/b.jpg",
    );
    for (const bad of [null, "", "https://evil.com/x.jpg", "storage:flyers/../secret"])
      expect(publicFlyerUrl(bad as string, "https://p.supabase.co")).toBeNull();
    expect(publicFlyerUrl("storage:flyers/a.jpg", undefined as unknown as string)).toBeNull();
  });
});
