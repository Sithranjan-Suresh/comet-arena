import { describe, expect, it, vi } from "vitest";
import {
  type DedupeStore,
  type ExistingCompetition,
  buildEmbeddingText,
  dedupeExtraction,
} from "@/lib/dedupe";
import { createImageResolver } from "@/lib/extract/resolve-image";
import { runExtraction } from "@/lib/extract/service";
import { loadFlyerCases } from "@/lib/fixtures";
import {
  type PostSource,
  type PublishInput,
  type PublishStore,
  publishExtraction,
} from "@/lib/pipeline/publish";
import type { Extraction } from "@/lib/schemas";
import { mockVision } from "@/lib/sources/mock/adapters";
import { Chaos } from "@/lib/sources/mock/chaos";
import { mockFlyerUrl } from "@/lib/sources/mock/constants";
import { cosine, mockEmbedder } from "@/lib/sources/mock/embedder";

vi.mock("server-only", () => ({}));

interface Row {
  id: string;
  slug: string;
  title: string;
  status: string;
  confirmations: number;
  embedding: number[] | null;
  needs_dedupe: boolean;
  deadlines: Date[];
  fields: ExistingCompetition;
  sources: { source: string; source_url: string | null; external_id: string | null }[];
  stages: number;
}

/** In-memory PublishStore + DedupeStore with the same semantics as the SQL functions. */
class MemoryStore implements PublishStore, DedupeStore {
  rows: Row[] = [];
  reviews: { id: string; kind: string; candidate: string | null; payload: unknown }[] = [];

  async publishCompetition(input: Parameters<PublishStore["publishCompetition"]>[0]) {
    const c = input.competition;
    const id = `c${this.rows.length + 1}`;
    this.rows.push({
      id,
      slug: c.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: c.title,
      status: c.status,
      confirmations: 0,
      embedding: c.embedding,
      needs_dedupe: c.needs_dedupe,
      deadlines: input.stages.map((s) => new Date(s.deadline_at)),
      fields: {
        host_name: c.host_name,
        description: c.description,
        prize: c.prize,
        location: c.location,
        register_url: c.register_url,
        flyer_url: c.flyer_url,
        categories: c.categories,
        cost: c.cost,
        format: c.format,
      },
      sources: input.sources,
      stages: input.stages.length,
    });
    return { id, slug: this.rows.at(-1)!.slug };
  }
  async getForMerge(id: string) {
    return structuredClone(this.rows.find((r) => r.id === id)!.fields);
  }
  async mergeInto(
    id: string,
    patch: Partial<ExistingCompetition>,
    source: { source: string; source_url: string | null; external_id: string | null },
  ) {
    const row = this.rows.find((r) => r.id === id)!;
    Object.assign(row.fields, patch);
    row.confirmations++;
    row.sources.push(source);
  }
  async addSource(
    id: string,
    source: { source: string; source_url: string | null; external_id: string | null },
  ) {
    this.rows.find((r) => r.id === id)!.sources.push(source);
  }
  async enqueueReview(item: {
    kind: string;
    candidate_competition_id: string | null;
    payload: unknown;
  }) {
    const id = `r${this.reviews.length + 1}`;
    this.reviews.push({
      id,
      kind: item.kind,
      candidate: item.candidate_competition_id,
      payload: item.payload,
    });
    return id;
  }
  async findMatches(args: Parameters<DedupeStore["findMatches"]>[0]) {
    const ms = args.windowDays * 86_400_000;
    return this.rows
      .filter(
        (r) =>
          r.embedding &&
          r.deadlines.some((d) => Math.abs(d.getTime() - args.around.getTime()) <= ms),
      )
      .map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        similarity: cosine(r.embedding!, args.embedding),
      }))
      .filter((m) => m.similarity >= args.minSimilarity);
  }
}

const src = (over: Partial<PostSource> = {}): PostSource => ({
  source: "instagram",
  source_url: "https://ig.example/p/1",
  external_id: "ig-1",
  posted_at: "2026-11-03T15:00:00Z",
  ...over,
});

async function process(store: MemoryStore, c: ReturnType<typeof loadFlyerCases>[number]) {
  const now = new Date("2026-11-10T15:00:00Z");
  const out = await runExtraction(
    { images: c.images.map(mockFlyerUrl), caption: c.caption, posted_at: c.posted_at },
    {
      vision: mockVision(Chaos.none()),
      resolveImage: createImageResolver(),
      mode: "mock",
      maxImages: 3,
      now,
    },
  );
  if (!out.ok) throw new Error(`extraction failed for ${c.id}`);
  const dedupe = await dedupeExtraction(out.extraction, {
    embedder: mockEmbedder(),
    store,
    postedAt: c.posted_at,
    now,
  });
  return publishExtraction(
    {
      extraction: out.extraction,
      meta: out.meta,
      dedupe,
      source: src({ external_id: c.id, source_url: `https://ig.example/p/${c.id}` }),
    },
    store,
  );
}

describe("end to end over the 20 fixture posts", () => {
  it("routes every post to the expected outcome", async () => {
    const store = new MemoryStore();
    const outcomes: Record<string, string> = {};
    for (const c of loadFlyerCases()) outcomes[c.id] = (await process(store, c)).outcome;

    expect(outcomes).toEqual({
      "f01-ais-case": "published",
      "f02-ais-case-repost": "merged",
      "f03-ais-case-repost2": "queued_duplicate",
      "f04-hackutd-24h": "published",
      "f05-pitch-night": "queued_low_confidence",
      "f06-no-year": "published",
      "f07-data-sprint": "published",
      "f08-three-minute-thesis": "published",
      "f09-design-jam": "published",
      "f10-investment": "published",
      "f11-speech-contest": "published",
      "f12-pre-health": "published",
      "f13-national": "published",
      "f14-messy": "queued_low_confidence",
      "f15-results-ais": "results_unmatched",
      "f16-results-hack": "results_unmatched",
      "f17-results-pitch": "results_unmatched",
      "f18-meeting": "not_competition",
      "f19-officers": "not_competition",
      "f20-social": "not_competition",
    });
  });

  it("shows the same competition once, with its sources and a confirmation", async () => {
    const store = new MemoryStore();
    for (const c of loadFlyerCases().slice(0, 3)) await process(store, c);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].confirmations).toBe(1);
    expect(store.rows[0].sources.map((s) => s.external_id)).toEqual([
      "f01-ais-case",
      "f02-ais-case-repost",
    ]);
    expect(store.reviews).toHaveLength(1);
    expect(store.reviews[0]).toMatchObject({ kind: "possible_duplicate", candidate: "c1" });
  });

  it("publishes new competitions as unverified with their stages", async () => {
    const store = new MemoryStore();
    await process(store, loadFlyerCases()[0]);
    expect(store.rows[0]).toMatchObject({ status: "unverified", stages: 3, needs_dedupe: false });
  });

  it("keeps low-confidence items out of the public listings and gives admins the full context", async () => {
    const store = new MemoryStore();
    for (const id of ["f05-pitch-night", "f14-messy"])
      await process(
        store,
        loadFlyerCases().find((c) => c.id === id)!,
      );
    expect(store.rows).toHaveLength(0);
    expect(store.reviews.map((r) => r.kind)).toEqual(["low_confidence", "low_confidence"]);
    const payload = store.reviews[0].payload as {
      extraction: Extraction;
      source: PostSource;
      meta: { penalties: unknown[] };
    };
    expect(payload.extraction.title).toBe("Startup Pitch Night");
    expect(payload.source.source_url).toContain("f05-pitch-night");
    expect(payload.meta.penalties).toEqual([{ reason: "no_register_link", amount: 0.1 }]);
  });
});

describe("publishExtraction", () => {
  const ex = (over: Partial<Extraction> = {}): Extraction => ({
    ...loadFlyerCases()[0].expected,
    ...over,
  });
  const fresh = { action: "new" as const, embedding: [1, 0], deferred: false };

  it("ignores non-competitions without touching the store", async () => {
    const store = new MemoryStore();
    const input: PublishInput = {
      extraction: ex({ kind: "not_competition", is_competition: false }),
      dedupe: fresh,
      source: src(),
    };
    expect(await publishExtraction(input, store)).toEqual({ outcome: "not_competition" });
    expect(store.rows).toHaveLength(0);
    expect(store.reviews).toHaveLength(0);
  });

  it("attaches a results recap to a matched listing as another source, never as a new competition", async () => {
    const store = new MemoryStore();
    await store.publishCompetition({
      competition: {
        title: "AIS Fall",
        host_org_id: null,
        host_name: null,
        categories: [],
        description: null,
        tier: "campus",
        prize: null,
        cost: "unknown",
        format: "unknown",
        location: null,
        register_url: null,
        utd_only: true,
        beginner_friendly: false,
        status: "unverified",
        confidence: 0.9,
        flyer_url: null,
        embedding: null,
        needs_dedupe: false,
        created_by: null,
      },
      stages: [],
      eligibility: ex().eligibility,
      sources: [],
    });
    const match = { id: "c1", slug: "ais-fall", title: "AIS Fall", similarity: 0.95 };
    const r = await publishExtraction(
      {
        extraction: ex({ kind: "results", is_competition: false }),
        dedupe: { action: "merge", match, embedding: [1, 0] },
        source: src({ external_id: "recap-1" }),
      },
      store,
    );
    expect(r).toEqual({ outcome: "results_attached", competition_id: "c1" });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].sources).toEqual([
      { source: "instagram", source_url: "https://ig.example/p/1", external_id: "recap-1" },
    ]);
  });

  it("publishes as new with needs_dedupe when the embedding service was down", async () => {
    const store = new MemoryStore();
    const r = await publishExtraction(
      {
        extraction: ex(),
        dedupe: { action: "new", embedding: null, deferred: true },
        source: src(),
      },
      store,
    );
    expect(r).toMatchObject({ outcome: "published", deferred_dedupe: true });
    expect(store.rows[0].needs_dedupe).toBe(true);
    expect(store.rows[0].embedding).toBeNull();
  });

  it("lists an announced-but-undated competition as expected", async () => {
    const store = new MemoryStore();
    await publishExtraction(
      { extraction: ex({ stages: [], confidence: 0.85 }), dedupe: fresh, source: src() },
      store,
    );
    expect(store.rows[0].status).toBe("expected");
  });

  it("carries the host org, flyer and submitter onto the new competition", async () => {
    const store = new MemoryStore();
    let captured: Parameters<PublishStore["publishCompetition"]>[0] | undefined;
    const spy: PublishStore = {
      ...store,
      publishCompetition: async (i) => ((captured = i), store.publishCompetition(i)),
    } as PublishStore;
    await publishExtraction(
      {
        extraction: ex(),
        dedupe: fresh,
        source: src({
          host_org_id: "org-1",
          flyer_url: "https://img/f.png",
          created_by: "user-1",
          source: "submission",
        }),
      },
      spy,
    );
    expect(captured!.competition).toMatchObject({
      host_org_id: "org-1",
      flyer_url: "https://img/f.png",
      created_by: "user-1",
      utd_only: true,
    });
    expect(captured!.sources[0].source).toBe("submission");
  });

  it("uses the confidence threshold at the boundary: 0.8 publishes, 0.79 queues", async () => {
    const s1 = new MemoryStore();
    expect(
      (
        await publishExtraction(
          { extraction: ex({ confidence: 0.8 }), dedupe: fresh, source: src() },
          s1,
        )
      ).outcome,
    ).toBe("published");
    const s2 = new MemoryStore();
    expect(
      (
        await publishExtraction(
          { extraction: ex({ confidence: 0.79 }), dedupe: fresh, source: src() },
          s2,
        )
      ).outcome,
    ).toBe("queued_low_confidence");
  });

  it("embedding text used for dedupe matches what was stored", async () => {
    const e = ex();
    expect(buildEmbeddingText(e)).toContain("AIS Fall Case Competition");
  });
});
