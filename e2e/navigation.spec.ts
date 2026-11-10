import { expect, test } from "@playwright/test";

const tabs = [
  { label: "The Field", path: "/field", heading: "The Field" },
  { label: "Schedule", path: "/schedule", heading: "Schedule" },
  { label: "Free Agency", path: "/free-agency", heading: "Free Agency" },
  { label: "Player Card", path: "/me", heading: "Player Card" },
  { label: "Scouting Report", path: "/", heading: "Scouting Report" },
];

test("primary tabs navigate and mark the current page", async ({ page }) => {
  await page.goto("/");
  for (const tab of tabs) {
    // Exactly one of the two navs (top bar on desktop, bottom tabs on mobile) is visible.
    const link = page
      .getByRole("link", { name: tab.label, exact: true })
      .locator("visible=true")
      .first();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${tab.path === "/" ? "/$" : tab.path}$`));
    await expect(page.getByRole("heading", { level: 1, name: tab.heading })).toBeVisible();
    await expect(
      page.getByRole("link", { name: tab.label, exact: true }).locator("visible=true").first(),
    ).toHaveAttribute("aria-current", "page");
  }
});

test("skip link is the first focusable element", async ({ page }) => {
  await page.goto("/field");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});
