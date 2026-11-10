import { expect, test } from "@playwright/test";

test("a Game Day page shows everything a student needs, without signing in", async ({ page }) => {
  await page.goto("/field");
  await page.getByRole("link", { name: "Comet Case Competition" }).first().click();
  await expect(page).toHaveURL(/\/game\/comet-case-competition$/);

  await expect(
    page.getByRole("heading", { level: 1, name: "Comet Case Competition" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Register/ })).toHaveAttribute(
    "href",
    /example\.com\/register/,
  );
  await expect(page.getByRole("list", { name: "Competition stages" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who can enter" })).toBeVisible();
  await expect(page.getByText(/updated .* ago/)).toBeVisible();
  // signed-out visitors are invited to sign in to check eligibility
  await expect(page.getByRole("link", { name: "Sign in" }).last()).toBeVisible();
});

test("expected (undated) and unknown competitions are handled", async ({ page }) => {
  await page.goto("/game/mock-trial-invitational");
  await expect(page.getByText("Registration opens soon")).toBeVisible();
  await expect(page.getByText("Dates not announced yet.")).toBeVisible();

  const res = await page.goto("/game/this-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Out of bounds" })).toBeVisible();
});

test("the page carries Event structured data and a descriptive title", async ({ page }) => {
  await page.goto("/game/comet-case-competition");
  await expect(page).toHaveTitle(/Comet Case Competition/);
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(JSON.parse(ld!)).toMatchObject({ "@type": "Event", name: "Comet Case Competition" });
});

test("the page links a share image that renders as a PNG", async ({ page, request }) => {
  await page.goto("/game/comet-case-competition");
  const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  expect(og).toContain("/game/comet-case-competition/opengraph-image");
  // Next adds a content hash to the file; fetch exactly the URL the page advertises.
  const res = await request.get(new URL(og!).pathname);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  const body = await res.body();
  expect(body.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(body.length).toBeGreaterThan(5_000);
});

test("unknown competitions still get a (generic) share image", async ({ page, request }) => {
  // The page 404s, so fetch the image route for a known page and swap the slug: the hash is per route, not per slug.
  await page.goto("/game/comet-case-competition");
  const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  const generic = new URL(og!).pathname.replace("comet-case-competition", "this-does-not-exist");
  const res = await request.get(generic);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});
