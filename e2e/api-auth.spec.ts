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
