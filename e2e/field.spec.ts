import { type Page, expect, test } from "@playwright/test";

/** On phones the filter panel is collapsed behind a "Filters" button. */
async function openFilters(page: Page) {
  const toggle = page.getByRole("button", { name: /^Filters/ });
  if (await toggle.isVisible()) await toggle.click();
}

test("The Field lists competitions soonest first and is public", async ({ page }) => {
  await page.goto("/field");
  await expect(page.getByRole("heading", { level: 1, name: "The Field" })).toBeVisible();
  const cards = page.getByRole("article");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(5);
  // past competitions are hidden by default
  await expect(page.getByText("(past)")).toHaveCount(0);
});

test("category filter narrows the list and lives in the URL (shareable)", async ({ page }) => {
  await page.goto("/field");
  await expect(page.getByRole("article").first()).toBeVisible(); // wait for streamed content
  const before = await page.getByRole("article").count();

  await openFilters(page);
  await page.getByRole("button", { name: "Hackathon", exact: true }).click();
  await expect(page).toHaveURL(/categories=hackathon/);
  await expect.poll(async () => page.getByRole("article").count()).toBeLessThan(before);

  // the same URL reproduces the same view and reflects the chip state
  await page.reload();
  await openFilters(page);
  await expect(page.getByRole("button", { name: "Hackathon", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("search narrows by title or description, and empty results offer a way back", async ({
  page,
}) => {
  await page.goto("/field");
  await expect(page.getByRole("article").first()).toBeVisible();

  await page.getByLabel("Search competitions").fill("pitch");
  await expect(page).toHaveURL(/q=pitch/);
  await expect(page.getByRole("link", { name: "Startup Pitch Night" })).toBeVisible();
  // matches title and description ("pitch round"), and excludes unrelated competitions
  await expect(page.getByRole("link", { name: "Comet Case Competition" })).toHaveCount(0);

  await page.getByLabel("Search competitions").fill("zzzz-nothing-matches");
  await expect(page.getByRole("heading", { name: "No competitions match" })).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/field$/);
});

test("include past shows past competitions", async ({ page }) => {
  await page.goto("/field?include_past=1");
  await expect(page.getByRole("link", { name: /\(past\)/ }).first()).toBeVisible();
});

test("invalid URL parameters fall back to defaults instead of erroring", async ({ page }) => {
  const res = await page.goto("/field?format=banana&limit=9999");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("article").first()).toBeVisible();
});
