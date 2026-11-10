import { expect, test } from "@playwright/test";

test("login rejects non-UTD emails before sending anything", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await page.getByLabel("UTD email").fill("someone@gmail.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Use your @utdallas.edu address" }),
  ).toBeVisible();
  await expect(page.getByLabel("UTD email")).toHaveAttribute("aria-invalid", "true");
});

test("login shows a friendly message for a failed callback", async ({ page }) => {
  await page.goto("/login?error=utd_email");
  await expect(
    page.getByRole("alert").filter({ hasText: "Use your @utdallas.edu address" }),
  ).toBeVisible();
});

test("callback with no code redirects back to login with an error", async ({ page }) => {
  await page.goto("/auth/callback?next=//evil.com");
  await expect(page).toHaveURL(/\/login\?error=missing_code$/); // unsafe next is dropped
});
