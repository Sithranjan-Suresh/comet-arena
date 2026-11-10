import { expect, test } from "@playwright/test";

test("home page responds and renders a document", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
});
