import { expect, test } from "@playwright/test";

test("an org page lists the competitions it hosts and Game Day links to it", async ({ page }) => {
  await page.goto("/game/comet-case-competition");
  await page.getByRole("link", { name: "AIS", exact: true }).click();
  await expect(page).toHaveURL(/\/org\/association-for-information-systems$/);
  await expect(
    page.getByRole("heading", { level: 1, name: /Association for Information Systems/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Comet Case Competition" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Past competitions" })).toBeVisible();
});

test("an org with no listings offers a way to add one; unknown orgs 404", async ({ page }) => {
  await page.goto("/org/math-club");
  await expect(page.getByRole("heading", { name: "Nothing listed right now" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Report a Game" })).toBeVisible();
  const res = await page.goto("/org/not-a-real-club");
  expect(res?.status()).toBe(404);
});
