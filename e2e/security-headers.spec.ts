import { expect, test } from "@playwright/test";

// The CSP and HSTS headers are production-only (dev needs eval for hot reload); e2e runs the production build.
test("every page ships the security headers", async ({ request }) => {
  for (const path of [
    "/",
    "/field",
    "/game/comet-case-competition",
    "/login",
    "/api/competitions",
  ]) {
    const h = (await request.get(path)).headers();
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], path).toContain("camera=()");
    expect(h["strict-transport-security"], path).toContain("max-age=");
    const csp = h["content-security-policy"] ?? "";
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).toContain("object-src 'none'");
    expect(csp, path).not.toContain("*.*"); // no wildcard-everything sources
    expect(csp, path).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  }
});

test("the app still works under the CSP: pages hydrate and filters respond", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await page.goto("/field");
  await expect(page.getByRole("article").first()).toBeVisible();
  await page.getByLabel("Search competitions").fill("pitch");
  await expect(page).toHaveURL(/q=pitch/);
  expect(violations).toEqual([]);
});
