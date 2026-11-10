import { expect, test } from "@playwright/test";

const visible = (page: import("@playwright/test").Page, label: string) =>
  // Exactly one of the two navs (top bar on desktop, bottom tabs on mobile) is visible.
  page.getByRole("link", { name: label, exact: true }).locator("visible=true").first();

test("public tabs navigate and mark the current page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Scouting Report" })).toBeVisible();
  await expect(visible(page, "Scouting Report")).toHaveAttribute("aria-current", "page");

  await visible(page, "The Field").click();
  await expect(page).toHaveURL(/\/field$/);
  await expect(page.getByRole("heading", { level: 1, name: "The Field" })).toBeVisible();
  await expect(visible(page, "The Field")).toHaveAttribute("aria-current", "page");
});

for (const tab of [
  { label: "Schedule", path: "/schedule" },
  { label: "Free Agency", path: "/free-agency" },
  { label: "Player Card", path: "/me" },
]) {
  test(`${tab.label} sends signed-out visitors to sign in and returns them after`, async ({
    page,
  }) => {
    await page.goto("/field");
    await visible(page, tab.label).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(tab.path)}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  });
}

test("skip link is the first focusable element", async ({ page }) => {
  await page.goto("/field");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});
