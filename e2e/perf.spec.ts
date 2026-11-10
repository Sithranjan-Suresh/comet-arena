import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * Performance budget on a throttled phone profile (4G network, 4x slower CPU), measured against the
 * production build. Opt-in because throttled runs are slow and noisy:  PERF=1 npx playwright test e2e/perf.spec.ts
 * Writes e2e/.perf-results.json; docs/perf.md records the numbers.
 */
test.skip(!process.env.PERF, "set PERF=1 to run the throttled performance budget");
test.describe.configure({ mode: "serial" });

const PAGES = ["/field", "/game/comet-case-competition", "/"];
const results: Record<string, unknown> = {};

for (const path of PAGES) {
  test(`mobile 4G: ${path} paints within budget`, async ({ page, browserName }, info) => {
    test.skip(info.project.name !== "mobile" || browserName !== "chromium", "mobile project only");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150, // ms RTT (Lighthouse "slow 4G")
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    // Warm the server cache once (ISR/data cache), then measure a first-visit (empty browser cache) load.
    await page.goto(path);
    await cdp.send("Network.clearBrowserCache"); // the measured load is a first visit for the browser
    const nav = await page.goto(path, { waitUntil: "load" });
    expect(nav?.status()).toBe(200);

    const m = await page.evaluate(
      () =>
        new Promise<{ fcp: number; lcp: number; transfer: number; ttfb: number }>((resolve) => {
          const paint = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
          let lcp = 0;
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) lcp = e.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          setTimeout(() => {
            const navEntry = performance.getEntriesByType(
              "navigation",
            )[0] as PerformanceNavigationTiming;
            const transfer = performance
              .getEntriesByType("resource")
              .reduce(
                (n, r) => n + ((r as PerformanceResourceTiming).transferSize || 0),
                navEntry.transferSize || 0,
              );
            resolve({ fcp: paint, lcp, transfer, ttfb: navEntry.responseStart });
          }, 500);
        }),
    );
    results[path] = { ...m, transferKB: Math.round(m.transfer / 1024) };
    writeFileSync("e2e/.perf-results.json", JSON.stringify(results, null, 2));
    console.log(`PERF ${path}`, JSON.stringify(results[path]));
    expect(m.fcp, "FCP must stay within 2 s on throttled mobile").toBeLessThanOrEqual(2000);
  });
}
