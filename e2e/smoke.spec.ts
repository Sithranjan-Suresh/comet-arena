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

test("Standings is public and explains how points work", async ({ page }) => {
  const res = await page.goto("/standings");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Standings" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Standings view" }).getByRole("link", { name: "Majors" }),
  ).toBeVisible();
  await page.getByText("How points work").click();
  await expect(page.getByText(/multiplied by the competition/)).toBeVisible();
  await expect(page.getByText(/AIS \(sample\) members won 7 competitions/)).toBeVisible();
  const api = await page.request.get("/api/standings?dimension=major&season=%27%3B%20drop");
  expect(api.status()).toBe(200); // junk parameters fall back to defaults
  expect((await api.json()).rows.length).toBeGreaterThan(0);
});
