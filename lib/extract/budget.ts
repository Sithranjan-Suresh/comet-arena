import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadFlyerCases } from "@/lib/fixtures";
import type { ExtractOutcome } from "./service";

/** Signature-moment budget (full_context §8): flyer to fields in at most 6 seconds. */
export const DEMO_BUDGET_MS = 6000;
/** The one flyer with a pre-extracted fallback. */
export const DEMO_CASE_ID = "f01-ais-case";

export const sha256 = (bytes: Uint8Array | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

let demo: { sha: string; outcome: ExtractOutcome } | undefined;

/** Hash and canned result of the demo flyer, built lazily from the fixtures. */
export function demoFlyer(): { sha: string; outcome: ExtractOutcome } {
  if (!demo) {
    const c = loadFlyerCases().find((x) => x.id === DEMO_CASE_ID)!;
    const sha = sha256(readFileSync(path.resolve(process.cwd(), "fixtures/flyers", c.images[0])));
    demo = {
      sha,
      outcome: {
        ok: true,
        extraction: c.expected,
        meta: {
          repaired: false,
          yearInferred: false,
          adjustments: [],
          penalties: [],
          modelScore: c.expected.confidence,
          publishable: true,
          skippedImages: [],
        },
      },
    };
  }
  return demo;
}

export interface BudgetLog {
  evt: "extract_latency";
  ms: number;
  source: "live" | "cache";
  reason?: "forced" | "over_budget";
  ok: boolean;
}

/**
 * Run extraction; if the image is the demo flyer and live extraction is not done within the budget (or the
 * cache is forced with DEMO_CACHE=1), answer from the cached result instead. Any other image always waits
 * for the live result. Latency is logged either way.
 */
export async function runWithBudget(args: {
  run: () => Promise<ExtractOutcome>;
  imageSha256?: string | null;
  budgetMs?: number;
  forceCache?: boolean;
  cached?: () => { sha: string; outcome: ExtractOutcome };
  now?: () => number;
  log?: (l: BudgetLog) => void;
}): Promise<ExtractOutcome> {
  const now = args.now ?? Date.now;
  const log = args.log ?? ((l) => console.log(JSON.stringify(l)));
  const budget = args.budgetMs ?? DEMO_BUDGET_MS;
  const start = now();
  const demoSha = args.cached ?? demoFlyer;
  const isDemo = !!args.imageSha256 && args.imageSha256 === demoSha().sha;

  if (isDemo && args.forceCache) {
    log({ evt: "extract_latency", ms: now() - start, source: "cache", reason: "forced", ok: true });
    return demoSha().outcome;
  }

  const live = args.run();
  if (!isDemo) {
    const out = await live
      .finally(() => undefined)
      .catch((e) => {
        log({ evt: "extract_latency", ms: now() - start, source: "live", ok: false });
        throw e;
      });
    log({ evt: "extract_latency", ms: now() - start, source: "live", ok: out.ok });
    return out;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((r) => (timer = setTimeout(() => r("timeout"), budget)));
  const winner = await Promise.race([live.then((o) => ({ o })).catch((e) => ({ e })), timeout]);
  clearTimeout(timer);

  if (winner === "timeout" || "e" in winner) {
    live.catch(() => undefined); // do not leave an unhandled rejection behind
    log({
      evt: "extract_latency",
      ms: now() - start,
      source: "cache",
      reason: "over_budget",
      ok: true,
    });
    return demoSha().outcome;
  }
  log({ evt: "extract_latency", ms: now() - start, source: "live", ok: winner.o.ok });
  return winner.o;
}
