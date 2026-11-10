import { describe, expect, it } from "vitest";
import {
  type DedupeStore,
  MERGE_THRESHOLD,
  REVIEW_THRESHOLD,
  buildEmbeddingText,
  dedupeExtraction,
  decideBand,
  hostsMatch,
  isSameEvent,
  titleSimilarity,
  fillNullFields,
  toPgVector,
} from "@/lib/dedupe";
import { loadFlyerCases } from "@/lib/fixtures";
import type { Embedder } from "@/lib/sources";
import { SourceError } from "@/lib/sources";
import { cosine, mockEmbedder } from "@/lib/sources/mock/embedder";

const cases = loadFlyerCases();
const byId = (id: string) => cases.find((c) => c.id === id)!.expected;

describe("decideBand", () => {
  it.each([
    [1, "merge"],
    [0.92, "merge"],
    [0.9199, "review"],
    [0.8, "review"],
    [0.7999, "new"],
    [0, "new"],
  ])("similarity %s -> %s", (s, expected) => expect(decideBand(s)).toBe(expected));

  it("uses the spec thresholds", () => {
    expect(MERGE_THRESHOLD).toBe(0.92);
    expect(REVIEW_THRESHOLD).toBe(0.8);
  });
});

describe("buildEmbeddingText", () => {
  it("is `title | host | first deadline (Chicago date) | sorted categories`", () => {
    expect(buildEmbeddingText(byId("f01-ais-case"))).toBe(
      "AIS Fall Case Competition | AIS | 2026-11-20 | case_competition, finance",
    );
  });

  it("uses the Chicago day, not the UTC day, for late-evening deadlines", () => {
    // 2026-11-21T05:59Z is Nov 20 11:59 PM in Chicago
    const t = buildEmbeddingText({
      title: "T",
      host: "H",
      categories: [],
      stages: [{ name: "x", starts_at: null, deadline_at: "2026-11-21T05:59:00Z" }],
    });
    expect(t).toBe("T | H | 2026-11-20 | ");
  });

  it("uses the earliest stage and tolerates missing stages", () => {
    const t = buildEmbeddingText({
      title: "T",
      host: null,
      categories: ["b", "a"] as never,
      stages: [
        { name: "late", starts_at: null, deadline_at: "2026-12-05T18:00:00Z" },
        { name: "early", starts_at: null, deadline_at: "2026-11-01T18:00:00Z" },
      ],
    });
    expect(t).toBe("T |  | 2026-11-01 | a, b");
    expect(buildEmbeddingText({ title: null, host: null, categories: [], stages: [] })).toBe(
      " |  |  | ",
    );
  });
});

/** In-memory store mirroring match_competitions: cosine similarity over stored embeddings, window by first stage. */
function memoryStore(
  rows: {
    id: string;
    slug: string;
    title: string;
    host: string | null;
    embedding: number[];
    deadlines: Date[];
  }[],
): DedupeStore & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async findMatches(args) {
      calls.push(args);
      const ms = args.windowDays * 86_400_000;
      return rows
        .filter((r) => r.deadlines.some((d) => Math.abs(d.getTime() - args.around.getTime()) <= ms))
        .map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          host_name: r.host,
          similarity: cosine(r.embedding, args.embedding),
        }))
        .filter((m) => m.similarity >= args.minSimilarity);
    },
  };
}

async function seeded(...ids: string[]) {
  const embedder = mockEmbedder();
  const rows = [];
  for (const id of ids) {
    const ex = byId(id);
    rows.push({
      id,
      slug: id,
      title: ex.title ?? "",
      host: ex.host,
      embedding: await embedder.embed(buildEmbeddingText(ex)),
      deadlines: ex.stages.map((s) => new Date(s.deadline_at)),
    });
  }
  return { embedder, store: memoryStore(rows) };
}

describe("dedupeExtraction over the fixture reposts", () => {
  it("merges an identical repost (same title, host and first deadline)", async () => {
    const { embedder, store } = await seeded("f01-ais-case");
    const r = await dedupeExtraction(byId("f02-ais-case-repost"), { embedder, store });
    expect(r.action).toBe("merge");
    if (r.action === "merge") expect(r.match.id).toBe("f01-ais-case");
  });

  it("merges a repost whose host is spelled out in full: the embedding alone says 'review' but title + host prove it is the same event", async () => {
    const { embedder, store } = await seeded("f01-ais-case");
    const repost = byId("f03-ais-case-repost2");
    const text = buildEmbeddingText(repost);
    const sim = cosine(
      await embedder.embed(buildEmbeddingText(byId("f01-ais-case"))),
      await embedder.embed(text),
    );
    expect(decideBand(sim)).toBe("review"); // the raw similarity is in the ambiguous band...
    const r = await dedupeExtraction(repost, { embedder, store });
    expect(r.action).toBe("merge"); // ...but same title + equivalent host promotes it
    if (r.action === "merge") expect(r.match.id).toBe("f01-ais-case");
  });

  it("merges a repost whose dates moved (the date in the embedding text pushes similarity under 0.92)", async () => {
    const { embedder, store } = await seeded("f01-ais-case");
    const moved = {
      ...byId("f02-ais-case-repost"),
      stages: [
        { name: "Registration closes", starts_at: null, deadline_at: "2026-11-27T05:59:00.000Z" },
      ],
    };
    const sim = cosine(
      await embedder.embed(buildEmbeddingText(byId("f01-ais-case"))),
      await embedder.embed(buildEmbeddingText(moved)),
    );
    expect(sim).toBeLessThan(MERGE_THRESHOLD);
    expect((await dedupeExtraction(moved, { embedder, store })).action).toBe("merge");
  });

  it("does NOT promote a lookalike with a different title or a different host", async () => {
    const { embedder, store } = await seeded("f01-ais-case");
    const otherTitle = { ...byId("f01-ais-case"), title: "AIS Fall Case Challenge Series Finals" };
    expect((await dedupeExtraction(otherTitle, { embedder, store })).action).toBe("review");
    const otherHost = {
      ...byId("f01-ais-case"),
      host: "HackUTD Case Team",
      title: "AIS Fall Case Competition!",
    };
    expect((await dedupeExtraction(otherHost, { embedder, store })).action).not.toBe("merge");
  });

  it("treats unrelated competitions as new", async () => {
    const { embedder, store } = await seeded("f01-ais-case", "f13-national");
    for (const id of ["f04-hackutd-24h", "f07-data-sprint", "f10-investment"]) {
      const r = await dedupeExtraction(byId(id), { embedder, store });
      expect(r.action, id).toBe("new");
      if (r.action === "new") expect(r.deferred).toBe(false);
    }
  });

  it("only compares competitions with a stage within ±45 days", async () => {
    const { embedder, store } = await seeded("f01-ais-case");
    const farFuture = {
      ...byId("f02-ais-case-repost"),
      stages: [{ name: "Finals", starts_at: null, deadline_at: "2027-09-01T17:00:00-05:00" }],
    };
    const r = await dedupeExtraction(farFuture, { embedder, store });
    expect(r.action).toBe("new");
    expect((store.calls[0] as { windowDays: number }).windowDays).toBe(45);
  });

  it("anchors an undated announcement on its post date", async () => {
    const { embedder, store } = await seeded("f01-ais-case");
    const undated = { ...byId("f02-ais-case-repost"), stages: [] };
    await dedupeExtraction(undated, { embedder, store, postedAt: "2026-11-04T18:30:00Z" });
    expect((store.calls[0] as { around: Date }).around.toISOString()).toBe(
      "2026-11-04T18:30:00.000Z",
    );
  });

  it("picks the best of several candidates", async () => {
    const { embedder, store } = await seeded("f01-ais-case", "f03-ais-case-repost2");
    const r = await dedupeExtraction(byId("f02-ais-case-repost"), { embedder, store });
    expect(r.action).toBe("merge");
    if (r.action === "merge") expect(r.match.id).toBe("f01-ais-case");
  });
});

describe("embedding outage", () => {
  it("publishes as new and flags the row for a later dedupe pass", async () => {
    const down: Embedder = {
      embed: async () => {
        throw new SourceError("embeddings", "unavailable");
      },
    };
    const store = memoryStore([]);
    const r = await dedupeExtraction(byId("f01-ais-case"), { embedder: down, store });
    expect(r).toEqual({ action: "new", embedding: null, deferred: true });
    expect(store.calls).toHaveLength(0);
  });
});

describe("fillNullFields", () => {
  const existing = {
    host_name: "AIS",
    description: null,
    prize: null,
    location: "JSOM",
    register_url: null,
    flyer_url: null,
    categories: [],
    cost: "unknown" as const,
    format: "in_person" as const,
  };
  const incoming = {
    host: "Other Host",
    description: "A case comp",
    prize: "$2,500",
    location: "Elsewhere",
    register_url: "https://example.com/r",
    categories: ["case_competition"] as never,
    cost: "free" as const,
    format: "virtual" as const,
    flyer_url: "https://img/1.png",
  };

  it("fills empty fields only and never overwrites known ones", () => {
    expect(fillNullFields(existing, incoming)).toEqual({
      description: "A case comp",
      prize: "$2,500",
      register_url: "https://example.com/r",
      flyer_url: "https://img/1.png",
      categories: ["case_competition"],
      cost: "free",
    });
  });

  it("returns an empty patch when nothing is new", () => {
    const full = {
      ...existing,
      description: "d",
      prize: "p",
      register_url: "u",
      flyer_url: "f",
      categories: ["x"],
      cost: "free" as const,
    };
    expect(fillNullFields(full, incoming)).toEqual({});
  });

  it("ignores empty incoming values", () => {
    expect(
      fillNullFields(existing, {
        ...incoming,
        description: null,
        prize: null,
        register_url: null,
        flyer_url: null,
        categories: [],
        cost: "unknown",
        format: "unknown",
      }),
    ).toEqual({});
  });
});

describe("toPgVector", () => {
  it("formats a pgvector literal", () => expect(toPgVector([0.5, -1, 0])).toBe("[0.5,-1,0]"));
});

describe("same-event helpers", () => {
  it("titleSimilarity is 1 for identical (ignoring case/punctuation) and low for different titles", () => {
    expect(titleSimilarity("AIS Fall Case Competition", "ais fall case competition!")).toBe(1);
    expect(
      titleSimilarity("AIS Fall Case Competition", "AIS Spring Case Competition"),
    ).toBeLessThan(0.9);
    expect(titleSimilarity("Hack for Good", "Startup Pitch Night")).toBeLessThan(0.3);
    expect(titleSimilarity("", "x")).toBe(0);
  });

  it("hostsMatch accepts equal names and acronyms, never empty or different hosts", () => {
    expect(hostsMatch("AIS", "ais")).toBe(true);
    expect(hostsMatch("AIS", "Association for Information Systems")).toBe(true);
    expect(hostsMatch("Association for Information Systems (AIS)", "AIS")).toBe(true);
    expect(hostsMatch("HackUTD", "AIS")).toBe(false);
    expect(hostsMatch(null, "AIS")).toBe(false);
    expect(hostsMatch("", "")).toBe(false);
  });

  it("isSameEvent needs BOTH a near-identical title and an equivalent host", () => {
    const match = { title: "AIS Fall Case Competition", host_name: "AIS" };
    expect(
      isSameEvent(
        { title: "AIS Fall Case Competition", host: "Association for Information Systems" },
        match,
      ),
    ).toBe(true);
    expect(isSameEvent({ title: "AIS Fall Case Competition", host: "HackUTD" }, match)).toBe(false);
    expect(isSameEvent({ title: "AIS Spring Case Competition", host: "AIS" }, match)).toBe(false);
    expect(isSameEvent({ title: null, host: "AIS" }, match)).toBe(false);
  });
});
