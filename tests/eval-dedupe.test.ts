import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSameEvent } from "@/lib/dedupe";
import {
  cosine,
  pairsFileSchema,
  productionConfusion,
  recommend,
  renderDedupeReport,
  scorePairs,
  sweep,
} from "@/lib/eval/dedupe";
import { mockEmbedder } from "@/lib/sources/mock/embedder";

const { pairs } = pairsFileSchema.parse(JSON.parse(readFileSync("eval/dedupe-pairs.json", "utf8")));
const scored = await scorePairs(pairs, mockEmbedder());

describe("dedupe eval set", () => {
  it("has 15 duplicate pairs and 30 non-duplicates with unique ids", () => {
    expect(pairs.filter((p) => p.dup)).toHaveLength(15);
    expect(pairs.filter((p) => !p.dup)).toHaveLength(30);
    expect(new Set(pairs.map((p) => p.id)).size).toBe(45);
  });

  it("production thresholds never merge two different events (the one unforgivable error)", () => {
    expect(productionConfusion(scored).nonDup.merge).toBe(0);
  });

  it("a recurring series is not promoted to a merge by title and host alone", () => {
    const base = { title: "Startup Pitch Night", host: "Blackstone LaunchPad" };
    const existing = { title: "Startup Pitch Night", host_name: "Blackstone LaunchPad" };
    expect(
      isSameEvent(
        { ...base, first_deadline: "2026-12-10T18:00:00-06:00" },
        { ...existing, nearest_deadline: "2026-11-12T18:00:00Z" },
      ),
    ).toBe(false);
    expect(
      isSameEvent(
        { ...base, first_deadline: "2026-11-19T18:00:00-06:00" },
        { ...existing, nearest_deadline: "2026-11-12T18:00:00Z" },
      ),
    ).toBe(true); // a week
    expect(isSameEvent(base, existing)).toBe(true); // no dates to compare: old behavior
  });
});

describe("sweep and recommendation", () => {
  it("precision falls and recall rises as the threshold drops", () => {
    const rows = sweep(scored);
    const at = (t: number) => rows.find((r) => r.threshold === t)!;
    expect(at(0.6).recall).toBe(1);
    expect(at(0.98).tp).toBe(0);
    expect(at(0.9).recall!).toBeLessThanOrEqual(at(0.7).recall!);
    expect(at(0.9).fp).toBeLessThanOrEqual(at(0.7).fp);
  });

  it("recommends the lowest zero-false-merge threshold and the highest 95%-recall threshold", () => {
    const rows = [
      { threshold: 0.7, tp: 15, fp: 9, fn: 0, precision: 0.6, recall: 1 },
      { threshold: 0.8, tp: 14, fp: 3, fn: 1, precision: 0.8, recall: 0.93 },
      { threshold: 0.85, tp: 12, fp: 0, fn: 3, precision: 1, recall: 0.8 },
      { threshold: 0.9, tp: 8, fp: 0, fn: 7, precision: 1, recall: 0.53 },
    ];
    expect(recommend(rows)).toEqual({ merge: 0.85, review: 0.7 });
    expect(recommend([])).toEqual({ merge: null, review: null });
  });

  it("cosine handles identical, orthogonal and zero vectors", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it("the report prints the confusion table, the sweep and the recommendation", () => {
    const md = renderDedupeReport(scored, { generatedOn: "2026-01-01", mock: true });
    expect(md).toContain("| Duplicate |");
    expect(md).toContain("## Threshold sweep");
    expect(md).toContain("Merge threshold:");
    expect(md).toContain("Mock run");
    expect(md).toContain("False merges: 0.");
  });
});
