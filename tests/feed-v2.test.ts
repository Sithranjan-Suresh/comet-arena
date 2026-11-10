import { describe, expect, it, vi } from "vitest";
import {
  type CourseGraph,
  expandCourses,
  extractCourseCodes,
  normalizeCourse,
} from "@/lib/courses";
import { getFeed, interestText } from "@/lib/data/feed";
import { type FeedCompetition, type FeedProfile, SIMILAR_MIN, rankFeed } from "@/lib/feed";
import { type CourseCache, buildCourseGraph, createNebula } from "@/lib/nebula";
import { SourceError } from "@/lib/sources";
import { mockNebula } from "@/lib/sources/mock/adapters";
import { Chaos } from "@/lib/sources/mock/chaos";

const NOW = new Date("2026-11-10T15:00:00Z");
const DAY = 86_400_000;
let n = 0;
const comp = (
  title: string,
  over: { days?: number; cats?: string[]; prereqs?: string[] } = {},
): FeedCompetition => {
  n++;
  return {
    card: {
      id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      slug: title.toLowerCase().replace(/\W+/g, "-"),
      title,
      host_name: "AIS",
      host_slug: "ais",
      categories: (over.cats ?? ["case_competition"]) as never,
      prize: null,
      status: "live",
      next_stage: {
        id: `s${n}`,
        name: "Reg",
        starts_at: null,
        deadline_at: new Date(NOW.getTime() + (over.days ?? 20) * DAY).toISOString(),
        order: 1,
      },
      viewer_saved: false,
    },
    eligibility: over.prereqs
      ? { majors: [], class_years: [], course_prereqs: over.prereqs, cross_school: false }
      : null,
  };
};
const profile = (over: Partial<FeedProfile> = {}): FeedProfile => ({
  major: "Computer Science",
  class_year: "junior",
  interests: [],
  courses: [],
  ...over,
});
const titles = (items: { card: { title: string } }[]) => items.map((i) => i.card.title);

describe("course helpers", () => {
  it("normalizes the ways students type codes", () => {
    for (const s of ["cs1337", "CS 1337", " cs-1337 ", "Cs.1337"])
      expect(normalizeCourse(s)).toBe("CS 1337");
    expect(normalizeCourse("Intro to Rocks")).toBe("INTRO TO ROCKS");
  });
  it("finds course codes anywhere in a nested prerequisite tree", () => {
    expect(
      extractCourseCodes({
        type: "collection",
        options: [{ text: "CS 2336 or cs2337" }, { courses: ["MATH 2417"] }],
      }).sort(),
    ).toEqual(["CS 2336", "CS 2337", "MATH 2417"]);
  });
  it("expands taken courses with their prerequisites, transitively and without looping", () => {
    const g: CourseGraph = new Map([
      ["CS 4348", ["CS 3345"]],
      ["CS 3345", ["CS 2336"]],
      ["CS 2336", ["CS 1337"]],
      ["CS 1337", ["CS 4348"]],
    ]);
    expect(expandCourses(["cs4348"], g).sort()).toEqual([
      "CS 1337",
      "CS 2336",
      "CS 3345",
      "CS 4348",
    ]);
    expect(expandCourses(["cs4348"], null)).toEqual(["CS 4348"]);
    expect(expandCourses([], g)).toEqual([]);
  });
});

describe("rankFeed v2 boosts and explanations", () => {
  const graph: CourseGraph = new Map([
    ["CS 4348", ["CS 3345"]],
    ["CS 3345", ["CS 2336"]],
  ]);

  it("a student who took an advanced course satisfies the prerequisite it implies, and is told so", () => {
    const needs = comp("Algorithms Contest", { prereqs: ["CS 3345"], days: 30 });
    const open = comp("Open Hack", { days: 25 });
    const withGraph = rankFeed([needs, open], profile({ courses: ["cs4348"] }), NOW, {
      courseGraph: graph,
    });
    expect(withGraph[0].card.title).toBe("Algorithms Contest"); // course fit outranks the earlier open one
    expect(withGraph[0].reasons).toContain("course_fit");
    // without Nebula the implied course is unknown, so the competition is hidden as a mismatch (v1 behavior)
    expect(titles(rankFeed([needs, open], profile({ courses: ["cs4348"] }), NOW))).toEqual([
      "Open Hack",
    ]);
  });

  it("embedding similarity boosts lookalikes of the student's interests and says why", () => {
    const a = comp("Sim A", { days: 40, cats: ["design"] });
    const b = comp("Plain B", { days: 20, cats: ["design"] });
    const out = rankFeed([b, a], profile({ interests: ["hackathon"] }), NOW, {
      similarity: new Map([
        [a.card.id, 0.8],
        [b.card.id, 0.2],
      ]),
    });
    expect(titles(out)).toEqual(["Sim A", "Plain B"]);
    expect(out[0].reasons).toContain("similar_to_interests");
    expect(out[1].reasons).not.toContain("similar_to_interests");
  });

  it("the similarity threshold is respected and a category match already explains itself", () => {
    const c = comp("Cat match", { cats: ["hackathon"] });
    const d = comp("Just under", { cats: ["design"] });
    const out = rankFeed([c, d], profile({ interests: ["hackathon"] }), NOW, {
      similarity: new Map([
        [c.card.id, 0.99],
        [d.card.id, SIMILAR_MIN - 0.01],
      ]),
    });
    expect(out.find((i) => i.card.title === "Cat match")!.reasons).toEqual(
      expect.arrayContaining(["matches_interests"]),
    );
    expect(out.find((i) => i.card.title === "Cat match")!.reasons).not.toContain(
      "similar_to_interests",
    );
    expect(out.find((i) => i.card.title === "Just under")!.reasons).not.toContain(
      "similar_to_interests",
    );
  });

  it("interest category (+2) outranks similarity (+1), and urgency still beats every boost", () => {
    const urgent = comp("Urgent plain", { days: 3, cats: ["design"] });
    const interest = comp("Interest", { days: 30, cats: ["hackathon"] });
    const similar = comp("Similar", { days: 10, cats: ["design"] });
    const out = rankFeed([similar, interest, urgent], profile({ interests: ["hackathon"] }), NOW, {
      similarity: new Map([[similar.card.id, 0.9]]),
    });
    expect(titles(out)).toEqual(["Urgent plain", "Interest", "Similar"]);
  });

  it("with no signals (Nebula and embeddings down) it falls back to interests then deadline", () => {
    const x = comp("Later interest", { days: 30, cats: ["hackathon"] });
    const y = comp("Sooner other", { days: 12, cats: ["design"] });
    const z = comp("Soonest other", { days: 9, cats: ["design"] });
    const base = rankFeed([y, z, x], profile({ interests: ["hackathon"] }), NOW);
    expect(titles(base)).toEqual(["Later interest", "Soonest other", "Sooner other"]);
    expect(
      rankFeed([y, z, x], profile({ interests: ["hackathon"] }), NOW, {
        courseGraph: null,
        similarity: null,
      }),
    ).toEqual(base);
  });
});

describe("nebula course graph", () => {
  const mem = () => {
    const store = new Map<string, { payload: unknown; fetched_at: string }>();
    const cache: CourseCache = {
      get: async (k) => store.get(k) ?? null,
      set: async (k, p) => void store.set(k, { payload: p, fetched_at: NOW.toISOString() }),
    };
    return { store, cache };
  };
  const quiet = new Chaos({
    latencyMs: [0, 0],
    malformedRate: 0,
    timeoutRate: 0,
    rateLimitAtCall: 0,
    sleep: async () => {},
  });

  it("resolves prerequisites breadth-first from the fixture source and caches each course", async () => {
    const { store, cache } = mem();
    const g = await buildCourseGraph(["cs4348"], { source: mockNebula(quiet), cache, now: NOW });
    expect(g!.get("CS 4348")).toEqual(["CS 3345"]);
    expect(expandCourses(["cs4348"], g)).toEqual(
      expect.arrayContaining(["CS 3345", "CS 2336", "CS 1337", "CS 1336"]),
    );
    expect(store.has("nebula:course:CS4348")).toBe(true);
  });

  it("serves from the cache without calling Nebula again", async () => {
    const { cache } = mem();
    const source = { fetchPrereqs: vi.fn(async () => ["CS 1336"]) };
    await buildCourseGraph(["CS 1337"], { source, cache, now: NOW });
    const calls = source.fetchPrereqs.mock.calls.length;
    await buildCourseGraph(["CS 1337"], { source, cache, now: NOW });
    expect(source.fetchPrereqs.mock.calls.length).toBe(calls);
  });

  it("unknown courses are cached as having no prerequisites", async () => {
    const { store, cache } = mem();
    const g = await buildCourseGraph(["ZZZ 9999"], {
      source: { fetchPrereqs: async () => null },
      cache,
      now: NOW,
    });
    expect(g!.get("ZZZ 9999")).toEqual([]);
    expect(store.get("nebula:course:ZZZ9999")!.payload).toEqual({ prereqs: [] });
  });

  it("Nebula down and nothing cached returns null (callers fall back); an expired cache entry is used instead of nothing", async () => {
    const down = {
      fetchPrereqs: async () => {
        throw new SourceError("nebula", "unavailable");
      },
    };
    expect(
      await buildCourseGraph(["CS 1337"], { source: down, cache: mem().cache, now: NOW }),
    ).toBeNull();
    const { store, cache } = mem();
    store.set("nebula:course:CS1337", {
      payload: { prereqs: ["CS 1336"] },
      fetched_at: "2020-01-01T00:00:00Z",
    });
    expect(
      (await buildCourseGraph(["CS 1337"], { source: down, cache, now: NOW }))!.get("CS 1337"),
    ).toEqual(["CS 1336"]);
  });

  it("a broken cache never stops the lookup", async () => {
    const broken: CourseCache = {
      get: async () => {
        throw new Error("db");
      },
      set: async () => {
        throw new Error("db");
      },
    };
    const g = await buildCourseGraph(["CS 1337"], {
      source: { fetchPrereqs: async () => ["CS 1336"] },
      cache: broken,
      now: NOW,
    });
    expect(g!.get("CS 1337")).toEqual(["CS 1336"]);
  });

  it("live client parses the prerequisite tree, maps errors, and ignores malformed codes", async () => {
    const res = (body: unknown, status = 200) =>
      ({ ok: status < 300, status, headers: new Headers(), json: async () => body }) as Response;
    const ok = createNebula({
      apiKey: "k",
      fetchImpl: (async () =>
        res({ data: [{ prerequisites: { options: [{ text: "CS 2336 or CS 2337" }] } }] })) as never,
    });
    expect((await ok.fetchPrereqs("cs3345"))!.sort()).toEqual(["CS 2336", "CS 2337"]);
    expect(
      await createNebula({ fetchImpl: (async () => res({}, 404)) as never }).fetchPrereqs(
        "CS 1337",
      ),
    ).toBeNull();
    expect(await ok.fetchPrereqs("not a course")).toBeNull();
    await expect(
      createNebula({ fetchImpl: (async () => res({}, 500)) as never }).fetchPrereqs("CS 1337"),
    ).rejects.toMatchObject({ kind: "unavailable" });
    await expect(
      createNebula({ fetchImpl: (async () => res({}, 429)) as never }).fetchPrereqs("CS 1337"),
    ).rejects.toMatchObject({ kind: "rate_limit" });
  });
});

describe("getFeed enrichment", () => {
  const row = {
    id: "00000000-0000-4000-8000-0000000000f1",
    slug: "a",
    title: "A Contest",
    host_name: "AIS",
    categories: ["design"],
    prize: null,
    status: "live",
    org: null,
    stages: [
      {
        id: "s1",
        name: "Reg",
        starts_at: null,
        deadline_at: new Date(NOW.getTime() + 5 * DAY).toISOString(),
        order: 1,
      },
    ],
    eligibility: null,
  };
  const fakeDb = (rpc: () => Promise<{ data: unknown; error: unknown }>) =>
    ({
      from: () => ({ select: () => ({ in: async () => ({ data: [row], error: null }) }) }),
      rpc,
    }) as never;

  it("embeds the interests, reads similarity from the database and reports it as a reason", async () => {
    const db = fakeDb(async () => ({ data: [{ id: row.id, similarity: 0.9 }], error: null }));
    const feed = await getFeed(db, profile({ interests: ["hackathon"] }), {
      now: NOW,
      enrich: { embed: async () => [0.1, 0.2] },
    });
    expect(feed.items[0].reasons).toContain("similar_to_interests");
  });

  it("embedding failure, RPC failure and Nebula failure each drop only their own boost", async () => {
    const rpcFail = fakeDb(async () => ({ data: null, error: { message: "x" } }));
    const f1 = await getFeed(rpcFail, profile({ interests: ["hackathon"], courses: ["CS 1337"] }), {
      now: NOW,
      enrich: {
        embed: async () => [1],
        courseGraph: async () => {
          throw new Error("nebula down");
        },
      },
    });
    expect(f1.items).toHaveLength(1);
    expect(f1.items[0].reasons).not.toContain("similar_to_interests");
    const embedFail = fakeDb(async () => ({ data: [], error: null }));
    const f2 = await getFeed(embedFail, profile({ interests: ["hackathon"] }), {
      now: NOW,
      enrich: {
        embed: async () => {
          throw new Error("down");
        },
      },
    });
    expect(f2.items).toHaveLength(1);
  });

  it("builds interest text from interests and major, and skips embedding when there are none", () => {
    expect(interestText(profile({ interests: ["case_competition", "finance"] }))).toBe(
      "case competition, finance | Computer Science",
    );
    expect(interestText(profile({ interests: [] }))).toBeNull();
  });
});
