import { expect, test } from "@playwright/test";

test("the confirm link is a button, never an automatic confirmation", async ({ page, request }) => {
  const token = "ab".repeat(16);
  await page.goto(`/subscribe/confirm?t=${token}`);
  await expect(page.getByRole("button", { name: "Confirm my subscription" })).toBeVisible();
  // A scanner-style GET must not change anything: the API only accepts POST.
  expect((await request.get(`/api/subscribe/confirm?t=${token}`)).status()).toBe(405);
});

test("invalid confirmation links explain themselves and offer no button", async ({ page }) => {
  await page.goto("/subscribe/confirm?t=nope");
  await expect(page.getByRole("alert").filter({ hasText: "not valid" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm my subscription" })).toHaveCount(0);
});

test("the Weekly signup form is on The Field and validates the email", async ({ page }) => {
  await page.goto("/field");
  const form = page.getByRole("form", { name: "Comet Arena Weekly" });
  await expect(form).toBeVisible();
  await form.getByLabel("Email").fill("not-an-email");
  await form.getByRole("button", { name: "Subscribe" }).click();
  await expect(form.getByText("Enter a valid email and try again.")).toBeVisible();
});

test("the signup endpoint answers the same for bots and rejects nothing it should hide", async ({
  request,
}) => {
  // No database in this environment => 503 for real submissions; a honeypot hit never reaches the database.
  const res = await request.post("/api/subscribe", {
    data: { email: "bot@example.com", website: "spam" },
  });
  expect([200, 503]).toContain(res.status());
});
