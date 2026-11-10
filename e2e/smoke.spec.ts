import { expect, test } from "@playwright/test";

test("home page responds and renders a document", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
});

test("the privacy notice is public and linked from the footer and the sign-in page", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "privacy notice" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Privacy" }),
  ).toBeVisible();
});
