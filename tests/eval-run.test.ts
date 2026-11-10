import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  normTitle,
  normUrl,
  sameInstant,
  scoreCase,
  summarize,
  toPrediction,
  type Prediction,
} from "@/lib/eval/metrics";
import { renderReport } from "@/lib/eval/report";
import { diskImageResolver, runEval } from "@/lib/eval/run";
import { type EvalCase, parseEvalCases } from "@/lib/eval/schema";
import { mockVision } from "@/lib/sources/mock/adapters";
import { Chaos } from "@/lib/sources/mock/chaos";

vi.mock("server-only", () => ({}));

const label = (over = {}): EvalCase["label"] =>
  ({
    kind: "competition",
    title: "AIS Fall Case Competition",
    host: "AIS",
    categories: ["case_competition", "finance"],
    first_deadline: "2026-11-20T23:59:00-06:00",
    register_url: "https://example.com/register/ais-fall-case",
    ...over,
  }) as EvalCase["label"];
const kase = (l = label()): EvalCase => ({
  id: "c",
  source_url: null,
  org: "ais",
  posted_at: "2026-11-03T15:00:00Z",
  caption: "x",
  images: [],
  label: l,
  notes: "",
});
const pred = (over: Partial<Prediction> = {}): Prediction => ({
  kind: "competition",
  title: "AIS Fall Case Competition",
  categories: ["case_competition", "finance"],
  first_deadline: "2026-11-20T23:59:00-06:00",
  register_url: "https://example.com/register/ais-fall-case",
  ...over,
});

describe("metric helpers", () => {
  it("normalizes titles and URLs; compares instants, not strings", () => {
    expect(normTitle("  AIS: Fall Case-Competition! ")).toBe("ais fall case competition");
    expect(normUrl("https://www.Example.com/register/x/?utm_source=ig#top")).toBe(
      "example.com/register/x",
    );
    expect(normUrl(null)).toBe("");
    expect(sameInstant("2026-11-21T05:59:00Z", "2026-11-20T23:59:00-06:00")).toBe(true);
    expect(sameInstant("2026-11-21T05:59:00Z", "2026-11-21T06:59:00Z")).toBe(false);
    expect(sameInstant(null, null)).toBe(true);
    expect(sameInstant(null, "2026-11-21T05:59:00Z")).toBe(false);
  });
  it("derives the first deadline from the earliest stage", () => {
    const p = toPrediction({
      kind: "competition",
      title: "T",
      stages: [
        { name: "b", starts_at: null, deadline_at: "2026-12-05T17:00:00-06:00" },
        { name: "a", starts_at: null, deadline_at: "2026-11-20T23:59:00-06:00" },
      ],
      categories: [],
      register_url: null,
    } as never);
    expect(p.first_deadline).toBe("2026-11-20T23:59:00-06:00");
    expect(toPrediction(null).kind).toBe("error");
  });
});

describe("scoring", () => {
  it("a perfect prediction scores every field", () => {
    const r = scoreCase(kase(), pred());
    expect(r.ok).toEqual({ kind: true, title: true, first_deadline: true, register_url: true });
    expect(r.cat).toEqual({ tp: 2, fp: 0, fn: 0 });
  });
  it("flags each wrong field and counts category misses", () => {
    const r = scoreCase(
      kase(),
      pred({
        title: "Other",
        first_deadline: "2026-11-21T23:59:00-06:00",
        register_url: null,
        categories: ["case_competition", "hackathon"],
      }),
    );
    expect(r.ok).toMatchObject({
      kind: true,
      title: false,
      first_deadline: false,
      register_url: false,
    });
    expect(r.cat).toEqual({ tp: 1, fp: 1, fn: 1 });
  });
  it("non-competitions only count toward kind and is-competition metrics", () => {
    const r = scoreCase(
      kase(
        label({
          kind: "not_competition",
          title: null,
          host: null,
          categories: [],
          first_deadline: null,
          register_url: null,
        }),
      ),
      pred({ kind: "competition" }),
    );
    expect(r.ok).toEqual({ kind: false, title: null, first_deadline: null, register_url: null });
  });
  it("summary computes precision/recall/accuracy and handles empty denominators", () => {
    const nc = label({
      kind: "not_competition",
      title: null,
      host: null,
      categories: [],
      first_deadline: null,
      register_url: null,
    });
    const s = summarize([
      scoreCase(kase(), pred()),
      scoreCase(kase(), pred({ kind: "not_competition", first_deadline: null })),
      scoreCase(kase(nc), pred()),
      scoreCase(kase(nc), pred({ kind: "not_competition" })),
    ]);
    expect(s.is_competition).toMatchObject({ precision: 0.5, recall: 0.5, f1: 0.5 });
    expect(s.first_deadline).toBe(0.5);
    expect(summarize([])).toMatchObject({ title: null, category_f1: null });
  });
});

const { cases } = parseEvalCases(readFileSync("eval/cases.jsonl", "utf8"));
const quiet = new Chaos({
  latencyMs: [0, 0],
  malformedRate: 0,
  timeoutRate: 0,
  rateLimitAtCall: 0,
  sleep: async () => {},
});
const deps = {
  vision: mockVision(quiet),
  mode: "mock" as const,
  maxImages: 3,
  resolveImage: diskImageResolver,
};

describe("runEval end to end (mock)", () => {
  it("scores 100% on the fixture-seeded set for both image and caption-only runs", async () => {
    for (const mode of ["image", "caption"] as const) {
      const run = await runEval(cases, mode, deps);
      expect(run.results).toHaveLength(cases.length);
      expect(run.summary).toMatchObject({ first_deadline: 1, title: 1, errors: 0 });
      expect(run.summary.is_competition).toMatchObject({ precision: 1, recall: 1 });
    }
  });

  it("a degraded model shows up as misses and in the failure list", async () => {
    const broken = {
      ...deps,
      vision: {
        complete: async () =>
          JSON.stringify({
            is_competition: false,
            kind: "not_competition",
            confidence: 0.2,
            missing_fields: [],
          }),
      },
    };
    const run = await runEval(cases.slice(0, 5), "image", broken);
    expect(run.summary.is_competition.recall).toBe(0);
    const md = renderReport([run], { generatedOn: "2026-01-01", caseCount: 5, mockMode: true });
    expect(md).toContain("## Failures: image + caption (5)");
    expect(md).toContain("kind: expected competition, got not_competition");
    expect(md).toContain("Mock run");
  });

  it("an infrastructure failure on one case is an error for that case, not a crash", async () => {
    let n = 0;
    const flaky = {
      ...deps,
      vision: {
        complete: async (i: Parameters<typeof deps.vision.complete>[0]) => {
          if (n++ === 0) throw new Error("boom");
          return deps.vision.complete(i);
        },
      },
    };
    const run = await runEval(cases.slice(0, 3), "image", flaky);
    expect(run.summary.errors).toBe(1);
    expect(run.results).toHaveLength(3);
  });

  it("the report lists image and baseline columns with the gate thresholds", async () => {
    const a = await runEval(cases.slice(0, 3), "image", deps);
    const b = await runEval(cases.slice(0, 3), "caption", deps);
    const md = renderReport([a, b], { generatedOn: "2026-01-01", caseCount: 3, mockMode: false });
    expect(md).toContain("| Metric | Image + caption | Caption only (baseline) | Gate |");
    expect(md).toContain("≥ 85.0%");
    expect(md).not.toContain("Mock run");
  });
});
