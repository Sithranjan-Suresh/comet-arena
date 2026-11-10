import { expect, test } from "@playwright/test";

test("signed-out home: hero, closing-soon preview and the Weekly signup", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /Never miss a competition/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse The Field" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Closing soon" })).toBeVisible();
  await expect(page.getByRole("article").first()).toBeVisible();
  await expect(page.getByRole("form", { name: "Comet Arena Weekly" })).toBeVisible();
  await expect(page).toHaveTitle(/Comet Arena/);
});

test("the home page is public: no redirect, 200", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/");
});
