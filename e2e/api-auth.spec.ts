import { expect, test } from "@playwright/test";

/** Every user-scoped API must refuse signed-out callers with 401 (never 500, never data). Extend as routes land. */
const PROTECTED: [
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  path: string,
  body?: object,
][] = [
  ["GET", "/api/saves"],
  ["POST", "/api/saves", { competition_id: "00000000-0000-4000-8000-000000000001" }],
  ["DELETE", "/api/saves/00000000-0000-4000-8000-000000000001"],
  ["GET", "/api/me/profile"],
  ["PUT", "/api/me/profile", { onboarded: true }],
  ["POST", "/api/me/ics-token"],
  ["DELETE", "/api/me", { confirm: "DELETE" }],
  ["POST", "/api/submit", { url: "https://example.com/post" }],
  ["GET", "/api/schedule"],
  ["GET", "/api/feed"],
  ["POST", "/api/confirm/00000000-0000-4000-8000-0000000000c1"],
  [
    "POST",
    "/api/flags",
    { competition_id: "00000000-0000-4000-8000-0000000000c1", field: "dates" },
  ],
  ["POST", "/api/admin/flags/00000000-0000-4000-8000-0000000000c1"],
  ["GET", "/api/orgs/00000000-0000-4000-8000-0000000000c1/claim"],
  ["POST", "/api/orgs/00000000-0000-4000-8000-0000000000c1/claim", { note: "x" }],
  ["POST", "/api/admin/claims/00000000-0000-4000-8000-0000000000c1", { approve: true }],
  ["PATCH", "/api/office/competitions/00000000-0000-4000-8000-0000000000c1", { prize: "x" }],
  [
    "POST",
    "/api/office/competitions/00000000-0000-4000-8000-0000000000c1/results",
    { csv: "a,1st" },
  ],
  ["GET", "/api/admin/review"],
  ["PATCH", "/api/admin/orgs/00000000-0000-4000-8000-0000000000c1", { ig_handle: "x" }],
  ["POST", "/api/admin/orgs/import", { csv: "a,b" }],
  ["POST", "/api/admin/review/00000000-0000-4000-8000-0000000000c1", { action: "approve" }],
  ["GET", "/api/me/entries"],
  [
    "POST",
    "/api/entries",
    { competition_id: "00000000-0000-4000-8000-0000000000c1", result: "first" },
  ],
  ["PATCH", "/api/entries/00000000-0000-4000-8000-0000000000c1", { result: "first" }],
  ["DELETE", "/api/entries/00000000-0000-4000-8000-0000000000c1"],
  [
    "POST",
    "/api/free-agents",
    { competition_id: "00000000-0000-4000-8000-0000000000c1", roles: ["dev"] },
  ],
  ["PATCH", "/api/free-agents/00000000-0000-4000-8000-0000000000c1", { status: "closed" }],
  [
    "POST",
    "/api/team-openings",
    {
      competition_id: "00000000-0000-4000-8000-0000000000c1",
      team_name: "T",
      roles_needed: ["dev"],
    },
  ],
  ["PATCH", "/api/team-openings/00000000-0000-4000-8000-0000000000c1", { status: "closed" }],
];

for (const [method, path, body] of PROTECTED) {
  test(`${method} ${path} requires sign-in`, async ({ request }) => {
    const res = await request.fetch(path, { method, data: body });
    expect(res.status()).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });
}

test("the internal extraction endpoint is locked without the key", async ({ request }) => {
  const res = await request.post("/api/extract", { data: { images: [], caption: "x" } });
  expect(res.status()).toBe(401);
});

test("calendar feed: malformed and unknown tokens are 404 and never reveal anything", async ({
  request,
}) => {
  for (const path of [
    "/api/calendar/garbage.ics",
    `/api/calendar/${"0".repeat(48)}`,
    "/api/calendar/..%2Fsecret.ics",
  ]) {
    const res = await request.get(path);
    expect([404, 503]).toContain(res.status()); // 503 only because this CI has no database configured
    expect(await res.text()).not.toMatch(/BEGIN:VCALENDAR/);
  }
});

test.describe("unsubscribe", () => {
  test("the one-click endpoint refuses missing and forged tokens and ignores GET", async ({
    request,
  }) => {
    expect((await request.post("/api/unsubscribe")).status()).toBe(400);
    expect((await request.post("/api/unsubscribe?t=not.a.token")).status()).toBe(400);
    // A GET (link prefetch / security scanner) must never perform the unsubscribe.
    expect((await request.get("/api/unsubscribe?t=anything")).status()).toBe(405);
  });

  test("the page explains an invalid link and never offers to confirm it", async ({ page }) => {
    await page.goto("/unsubscribe?t=garbage");
    await expect(page.getByRole("alert").filter({ hasText: "not valid" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm unsubscribe" })).toHaveCount(0);
  });
});

test("POST /api/submit/:id/confirm requires sign-in", async ({ request }) => {
  const res = await request.post("/api/submit/00000000-0000-4000-8000-0000000000b1/confirm", {
    data: {},
  });
  expect(res.status()).toBe(401);
});

test("the board endpoint is public but validates its inputs", async ({ request }) => {
  expect((await request.get("/api/competitions/Not_A_Slug/board")).status()).toBe(404);
  expect(
    (await request.get("/api/competitions/comet-case-competition/board?role=ceo")).status(),
  ).toBe(400);
});

test("admin pages never render for signed-out visitors (they are sent to sign in)", async ({
  page,
}) => {
  for (const path of [
    "/admin",
    "/admin/review",
    "/admin/orgs",
    "/admin/submissions",
    "/admin/ingest",
  ]) {
    await page.goto(path);
    expect(new URL(page.url()).pathname, path).toBe("/login");
  }
});

test("the Front Office sends signed-out visitors to sign in and returns them after", async ({
  page,
}) => {
  await page.goto("/office");
  await expect(page).toHaveURL(/\/login\?next=%2Foffice$/);
});
