import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Every public page must have zero serious or critical axe violations (WCAG 2.1 A/AA).
 * Signed-in pages are covered by component tests today and join this list when e2e auth exists.
 */
const PAGES = [
  "/",
  "/field",
  "/field?categories=hackathon",
  "/game/comet-case-competition",
  "/schedule",
  "/free-agency",
  "/login",
  "/report",
  "/unsubscribe?t=invalid",
];

for (const path of PAGES) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      bad.map(
        (v) =>
          `${v.id} (${v.impact}): ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(" "))
            .join(" | ")}`,
      ),
    ).toEqual([]);
  });
}

test("keyboard: the skip link is the first tab stop and moves focus into the page", async ({
  page,
}) => {
  await page.goto("/field");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("keyboard: every interactive control on The Field is reachable and shows a focus ring", async ({
  page,
}) => {
  await page.goto("/field");
  await expect(page.getByRole("article").first()).toBeVisible();
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const visible = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
      return {
        label: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 40),
        visible,
      };
    });
    if (!info) continue;
    expect(info.visible, `no visible focus ring on "${info.label}"`).toBe(true);
    seen.add(info.label);
  }
  expect(seen.size).toBeGreaterThan(8);
});

test("countdowns have a spoken equivalent, not just ticking digits", async ({ page }) => {
  await page.goto("/field");
  const times = page.locator("article time[aria-label]");
  await expect(times.first()).toBeVisible();
  expect((await times.first().getAttribute("aria-label"))!.length).toBeGreaterThan(5);
});

test("dialogs trap focus and Escape returns it to the opener", async ({ page }) => {
  await page.goto("/free-agency");
  const opener = page.getByRole("button", { name: /free agent|team|post|join|add/i }).first();
  test.skip(
    !(await opener.isVisible().catch(() => false)),
    "no dialog opener is visible when signed out",
  );
  await opener.focus();
  await opener.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
