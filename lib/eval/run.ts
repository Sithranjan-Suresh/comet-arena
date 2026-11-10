import { readFile } from "node:fs/promises";
import { runExtraction, type ExtractDeps } from "@/lib/extract/service";
import {
  type CaseResult,
  type Prediction,
  scoreCase,
  summarize,
  toPrediction,
  type Summary,
} from "./metrics";
import type { EvalCase } from "./schema";

export type EvalMode = "image" | "caption";

export interface EvalRun {
  mode: EvalMode;
  summary: Summary;
  results: CaseResult[];
}

/** Local file reader for eval images (the eval set lives on disk, not in storage). */
export const diskImageResolver: ExtractDeps["resolveImage"] = async (ref) => readFile(ref);

/**
 * Run the extraction pipeline over every case. `image` sends the flyers plus caption; `caption` is the
 * text-only baseline, which shows how much the vision model adds. Each case is evaluated "as of" its post
 * date so year inference matches what ingestion would have seen. An infrastructure failure on one case is
 * recorded as an error for that case, never aborts the run.
 */
export async function runEval(
  cases: EvalCase[],
  mode: EvalMode,
  deps: Omit<ExtractDeps, "now">,
  opts: { onCase?: (id: string, i: number, n: number) => void } = {},
): Promise<EvalRun> {
  const results: CaseResult[] = [];
  for (const [i, c] of cases.entries()) {
    opts.onCase?.(c.id, i, cases.length);
    let predicted: Prediction;
    try {
      const out = await runExtraction(
        {
          images: mode === "image" ? c.images : [],
          caption: c.caption || undefined,
          source_url: c.source_url ?? undefined,
          posted_at: c.posted_at,
        },
        { ...deps, now: new Date(c.posted_at) },
      );
      predicted = toPrediction(out.ok ? out.extraction : null);
    } catch {
      predicted = toPrediction(null);
    }
    results.push(scoreCase(c, predicted));
  }
  return { mode, summary: summarize(results), results };
}
