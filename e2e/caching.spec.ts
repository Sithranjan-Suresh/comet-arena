import { expect, test } from "@playwright/test";

// Game Day, org pages and the home page are served from the ISR cache (revalidated every 5 minutes), so
// a traffic spike never turns into database load. Regression guard: anything that opts these pages into
// dynamic rendering (cookies(), useSearchParams() without Suspense, no-store fetches) shows up here.
for (const path of [
  "/game/comet-case-competition",
  "/org/association-for-information-systems",
  "/",
]) {
  test(`${path} is cacheable at the edge`, async ({ request }) => {
    await request.get(path); // first request may render
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const cc = res.headers()["cache-control"] ?? "";
    expect(cc).toContain("s-maxage=300");
    expect(cc).not.toContain("no-store");
  });
}
