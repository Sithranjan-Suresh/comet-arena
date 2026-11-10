import { describe, expect, it, vi } from "vitest";
import {
  DEMO_BUDGET_MS,
  type BudgetLog,
  demoFlyer,
  runWithBudget,
  sha256,
} from "@/lib/extract/budget";
import type { ExtractOutcome } from "@/lib/extract/service";
import { loadFlyerCases } from "@/lib/fixtures";
import { flyerImageBytes } from "@/lib/fixtures";

const demo = demoFlyer();
const live = (title: string): ExtractOutcome => ({
  ok: true,
  extraction: { ...loadFlyerCases()[0].expected, title },
  meta: demo.outcome.ok ? demo.outcome.meta : (undefined as never),
});
const logs = () => {
  const l: BudgetLog[] = [];
  return { l, log: (x: BudgetLog) => void l.push(x) };
};

describe("demo flyer", () => {
  it("is identified by the hash of its image and has a canned result", () => {
    const f = loadFlyerCases()[0];
    expect(demo.sha).toBe(sha256(flyerImageBytes(f.images[0])));
    expect(demo.outcome.ok && demo.outcome.extraction.title).toBe("AIS Fall Case Competition");
  });
});

describe("runWithBudget", () => {
  it("returns the live result when it arrives within the budget, and logs the latency", async () => {
    const { l, log } = logs();
    let t = 0;
    const out = await runWithBudget({
      run: async () => ((t = 1200), live("Live")),
      imageSha256: demo.sha,
      now: () => t,
      log,
    });
    expect(out.ok && out.extraction.title).toBe("Live");
    expect(l).toEqual([{ evt: "extract_latency", ms: 1200, source: "live", ok: true }]);
  });

  it("falls back to the cached demo result when live is slower than the budget", async () => {
    vi.useFakeTimers();
    const { l, log } = logs();
    const never = new Promise<ExtractOutcome>(() => {});
    const p = runWithBudget({ run: () => never, imageSha256: demo.sha, log });
    await vi.advanceTimersByTimeAsync(DEMO_BUDGET_MS + 1);
    const out = await p;
    expect(out).toBe(demo.outcome);
    expect(l[0]).toMatchObject({ source: "cache", reason: "over_budget" });
    vi.useRealTimers();
  });

  it("falls back to the cache when live fails for the demo flyer", async () => {
    const { l, log } = logs();
    const out = await runWithBudget({
      run: async () => {
        throw new Error("groq down");
      },
      imageSha256: demo.sha,
      log,
    });
    expect(out).toBe(demo.outcome);
    expect(l[0]).toMatchObject({ source: "cache" });
  });

  it("DEMO_CACHE forces the cached answer instantly, for the demo flyer only", async () => {
    const run = vi.fn(async () => live("Live"));
    const { l, log } = logs();
    expect(await runWithBudget({ run, imageSha256: demo.sha, forceCache: true, log })).toBe(
      demo.outcome,
    );
    expect(run).not.toHaveBeenCalled();
    expect(l[0]).toMatchObject({ source: "cache", reason: "forced" });

    const other = await runWithBudget({
      run,
      imageSha256: sha256(new Uint8Array([1, 2, 3])),
      forceCache: true,
      log,
    });
    expect(other.ok && other.extraction.title).toBe("Live");
    expect(run).toHaveBeenCalledOnce();
  });

  it("any other image always waits for the live result, however slow, and propagates its failures", async () => {
    vi.useFakeTimers();
    const { l, log } = logs();
    const p = runWithBudget({
      run: () => new Promise((r) => setTimeout(() => r(live("Slow")), DEMO_BUDGET_MS * 2)),
      imageSha256: "not-the-demo",
      log,
    });
    await vi.advanceTimersByTimeAsync(DEMO_BUDGET_MS * 2 + 1);
    expect((await p).ok).toBe(true);
    expect(l[0]).toMatchObject({ source: "live" });
    vi.useRealTimers();

    const fail = logs();
    await expect(
      runWithBudget({
        run: async () => {
          throw new Error("boom");
        },
        imageSha256: null,
        log: fail.log,
      }),
    ).rejects.toThrow("boom");
    expect(fail.l[0]).toMatchObject({ source: "live", ok: false });
  });
});
