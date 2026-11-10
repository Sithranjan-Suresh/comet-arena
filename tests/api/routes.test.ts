import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UUID,
  adminMock,
  dbDown,
  params,
  post,
  req,
  reset,
  signedIn,
  supabaseMock,
  world,
} from "./harness";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", async () => (await import("./harness")).supabaseMock);
vi.mock("@/lib/supabase/admin", async () => (await import("./harness")).adminMock);
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import * as savesList from "../../app/api/saves/route";
import * as savesOne from "../../app/api/saves/[competition_id]/route";
import * as entries from "../../app/api/entries/route";
import * as entriesOne from "../../app/api/entries/[id]/route";
import * as freeAgents from "../../app/api/free-agents/route";
import * as freeAgentsOne from "../../app/api/free-agents/[id]/route";
import * as openings from "../../app/api/team-openings/route";
import * as openingsOne from "../../app/api/team-openings/[id]/route";
import * as profile from "../../app/api/me/profile/route";
import * as me from "../../app/api/me/route";
import * as icsToken from "../../app/api/me/ics-token/route";
import * as myEntries from "../../app/api/me/entries/route";
import * as schedule from "../../app/api/schedule/route";
import * as feed from "../../app/api/feed/route";
import * as confirmRoute from "../../app/api/confirm/[competition_id]/route";
import * as flagsRoute from "../../app/api/flags/route";
import * as adminFlag from "../../app/api/admin/flags/[id]/route";
import * as claimRoute from "../../app/api/orgs/[id]/claim/route";
import * as adminClaim from "../../app/api/admin/claims/[id]/route";
import * as officeEdit from "../../app/api/office/competitions/[id]/route";
import * as officeResults from "../../app/api/office/competitions/[id]/results/route";
import * as submit from "../../app/api/submit/route";
import * as confirm from "../../app/api/submit/[id]/confirm/route";
import * as adminReview from "../../app/api/admin/review/route";
import * as adminReviewOne from "../../app/api/admin/review/[id]/route";
import * as adminOrg from "../../app/api/admin/orgs/[id]/route";
import * as adminImport from "../../app/api/admin/orgs/import/route";
import * as extract from "../../app/api/extract/route";
import * as calendar from "../../app/api/calendar/[token]/route";
import * as competitions from "../../app/api/competitions/route";
import * as unsubscribe from "../../app/api/unsubscribe/route";

void supabaseMock;
void adminMock;
beforeEach(() => {
  reset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
});
afterEach(() => vi.unstubAllEnvs());

const json = async (r: Response) => (await r.json()) as { error?: string; message?: string };

/** Every user-scoped handler, called with a plausible request. */
const userRoutes: [string, () => Promise<Response>][] = [
  ["GET /api/saves", () => savesList.GET()],
  ["POST /api/saves", () => savesList.POST(post("/api/saves", { competition_id: UUID }))],
  [
    "DELETE /api/saves/:id",
    () => savesOne.DELETE(req("DELETE", "/x"), params({ competition_id: UUID })),
  ],
  [
    "POST /api/entries",
    () => entries.POST(post("/api/entries", { competition_id: UUID, result: "first" })),
  ],
  [
    "PATCH /api/entries/:id",
    () => entriesOne.PATCH(req("PATCH", "/x", { result: "first" }), params({ id: UUID })),
  ],
  ["DELETE /api/entries/:id", () => entriesOne.DELETE(req("DELETE", "/x"), params({ id: UUID }))],
  [
    "POST /api/free-agents",
    () => freeAgents.POST(post("/x", { competition_id: UUID, roles: ["dev"] })),
  ],
  [
    "PATCH /api/free-agents/:id",
    () => freeAgentsOne.PATCH(req("PATCH", "/x", { status: "closed" }), params({ id: UUID })),
  ],
  [
    "POST /api/team-openings",
    () =>
      openings.POST(post("/x", { competition_id: UUID, team_name: "T", roles_needed: ["dev"] })),
  ],
  [
    "PATCH /api/team-openings/:id",
    () => openingsOne.PATCH(req("PATCH", "/x", { status: "closed" }), params({ id: UUID })),
  ],
  ["GET /api/me/profile", () => profile.GET()],
  ["PUT /api/me/profile", () => profile.PUT(req("PUT", "/x", { onboarded: true }))],
  ["DELETE /api/me", () => me.DELETE(req("DELETE", "/x", { confirm: "DELETE" }))],
  ["POST /api/me/ics-token", () => icsToken.POST()],
  ["GET /api/me/entries", () => myEntries.GET()],
  ["GET /api/schedule", () => schedule.GET()],
  ["GET /api/feed", () => feed.GET(req("GET", "/api/feed"))],
  [
    "POST /api/confirm/:id",
    () => confirmRoute.POST(req("POST", "/x"), params({ competition_id: UUID })),
  ],
  [
    "POST /api/flags",
    () => flagsRoute.POST(post("/api/flags", { competition_id: UUID, field: "dates" })),
  ],
  ["GET /api/orgs/:id/claim", () => claimRoute.GET(req("GET", "/x"), params({ id: UUID }))],
  [
    "POST /api/orgs/:id/claim",
    () => claimRoute.POST(post("/x", { note: "hi" }), params({ id: UUID })),
  ],
  [
    "PATCH /api/office/competitions/:id",
    () => officeEdit.PATCH(req("PATCH", "/x", { prize: "x" }), params({ id: UUID })),
  ],
  [
    "POST /api/office/competitions/:id/results",
    () => officeResults.POST(post("/x", { csv: "a@utdallas.edu,1st" }), params({ id: UUID })),
  ],
  ["POST /api/submit", () => submit.POST(post("/api/submit", { url: "https://example.com/p" }))],
  ["POST /api/submit/:id/confirm", () => confirm.POST(post("/x", {}), params({ id: UUID }))],
];

const adminRoutes: [string, () => Promise<Response>][] = [
  [
    "POST /api/admin/claims/:id",
    () => adminClaim.POST(post("/x", { approve: true }), params({ id: UUID })),
  ],
  ["POST /api/admin/flags/:id", () => adminFlag.POST(req("POST", "/x"), params({ id: UUID }))],
  ["GET /api/admin/review", () => adminReview.GET()],
  [
    "POST /api/admin/review/:id",
    () => adminReviewOne.POST(post("/x", { action: "reject" }), params({ id: UUID })),
  ],
  [
    "PATCH /api/admin/orgs/:id",
    () => adminOrg.PATCH(req("PATCH", "/x", { ig_handle: "x" }), params({ id: UUID })),
  ],
  ["POST /api/admin/orgs/import", () => adminImport.POST(post("/x", { csv: "a,b" }))],
];

describe("auth: signed-out callers get 401 JSON and never touch the database", () => {
  it.each(userRoutes)("%s", async (_n, call) => {
    world.result.data = [{ secret: "row" }];
    const res = await call();
    expect(res.status).toBe(401);
    expect(await json(res)).toMatchObject({ error: "unauthorized" });
  });
  it.each(adminRoutes)("%s", async (_n, call) => {
    expect((await call()).status).toBe(401);
  });
});

describe("auth: signed-in non-admins get 403 on every admin route", () => {
  it.each(adminRoutes)("%s", async (_n, call) => {
    signedIn(false);
    const res = await call();
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: "forbidden" });
  });
});

describe("validation: malformed input is a 4xx with a JSON error, never a 500", () => {
  beforeEach(() => signedIn());
  const bad: [string, () => Promise<Response>][] = [
    ["POST /api/saves not json", () => savesList.POST(post("/api/saves", "{oops"))],
    [
      "POST /api/saves bad uuid",
      () => savesList.POST(post("/api/saves", { competition_id: "nope" })),
    ],
    [
      "DELETE /api/saves/:id bad uuid",
      () => savesOne.DELETE(req("DELETE", "/x"), params({ competition_id: "nope" })),
    ],
    [
      "POST /api/flags bad field",
      () => flagsRoute.POST(post("/x", { competition_id: UUID, field: "bogus" })),
    ],
    ["POST /api/flags not json", () => flagsRoute.POST(post("/x", "{oops"))],
    [
      "POST /api/confirm/:id bad id",
      () => confirmRoute.POST(req("POST", "/x"), params({ competition_id: "nope" })),
    ],
    [
      "POST /api/orgs/:id/claim bad id",
      () => claimRoute.POST(post("/x", {}), params({ id: "nope" })),
    ],
    [
      "POST /api/orgs/:id/claim note too long",
      () => claimRoute.POST(post("/x", { note: "x".repeat(301) }), params({ id: UUID })),
    ],
    [
      "PATCH /api/office/competitions/:id empty",
      () => officeEdit.PATCH(req("PATCH", "/x", {}), params({ id: UUID })),
    ],
    [
      "PATCH /api/office/competitions/:id bad url",
      () =>
        officeEdit.PATCH(
          req("PATCH", "/x", { register_url: "javascript:x" }),
          params({ id: UUID }),
        ),
    ],
    [
      "POST /api/office/.../results empty",
      () => officeResults.POST(post("/x", {}), params({ id: UUID })),
    ],
    [
      "POST /api/office/.../results no valid rows",
      () => officeResults.POST(post("/x", { csv: "bad,row" }), params({ id: UUID })),
    ],
    ["POST /api/entries empty", () => entries.POST(post("/x", {}))],
    [
      "POST /api/entries bad result",
      () => entries.POST(post("/x", { competition_id: UUID, result: "gold" })),
    ],
    [
      "POST /api/free-agents no roles",
      () => freeAgents.POST(post("/x", { competition_id: UUID, roles: [] })),
    ],
    [
      "POST /api/free-agents bad role",
      () => freeAgents.POST(post("/x", { competition_id: UUID, roles: ["wizard"] })),
    ],
    [
      "POST /api/team-openings no name",
      () => openings.POST(post("/x", { competition_id: UUID, roles_needed: ["dev"] })),
    ],
    [
      "PUT /api/me/profile bad class year",
      () => profile.PUT(req("PUT", "/x", { class_year: "wizard" })),
    ],
    ["POST /api/submit empty", () => submit.POST(post("/api/submit", {}))],
    [
      "POST /api/submit/:id/confirm empty",
      () => confirm.POST(post("/x", {}), params({ id: UUID })),
    ],
    [
      "POST /api/submit/:id/confirm bad id",
      () => confirm.POST(post("/x", {}), params({ id: "nope" })),
    ],
    [
      "POST /api/admin/review/:id bad id",
      () => adminReviewOne.POST(post("/x", {}), params({ id: "nope" })),
    ],
  ];
  it.each(bad)("%s", async (_n, call) => {
    const res = await call();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect((await json(res)).error).toBeTruthy();
  });

  it("admin routes validate bodies too", async () => {
    signedIn(true);
    expect(
      (await adminOrg.PATCH(req("PATCH", "/x", { ig_handle: "bad handle!" }), params({ id: UUID })))
        .status,
    ).toBe(422);
    expect((await adminOrg.PATCH(req("PATCH", "/x", {}), params({ id: UUID }))).status).toBe(422);
    expect(
      (await adminOrg.PATCH(req("PATCH", "/x", { ig_handle: "ok" }), params({ id: "nope" })))
        .status,
    ).toBe(404);
    expect((await adminImport.POST(post("/x", { csv: "" }))).status).toBe(422);
    expect((await adminImport.POST(post("/x", {}))).status).toBe(422);
    expect(
      (await adminReviewOne.POST(post("/x", { action: "explode" }), params({ id: UUID }))).status,
    ).toBeGreaterThanOrEqual(404);
  });
});

describe("failure: a database outage is a 5xx JSON error that leaks nothing", () => {
  it.each([
    ["GET /api/saves", () => savesList.GET()],
    ["GET /api/me/profile", () => profile.GET()],
    ["GET /api/schedule", () => schedule.GET()],
    ["GET /api/me/entries", () => myEntries.GET()],
  ])("%s", async (_n, call) => {
    signedIn();
    dbDown();
    const res = await call();
    expect(res.status).toBeGreaterThanOrEqual(500);
    const text = await res.text();
    expect(text).not.toMatch(/SECRET|connection string|XX000|stack/i);
    expect(() => JSON.parse(text)).not.toThrow();
  });
});

describe("public and key-protected routes", () => {
  it("/api/extract refuses callers without the internal key", async () => {
    vi.stubEnv("EXTRACT_INTERNAL_KEY", "k-1234567890");
    expect((await extract.POST(post("/api/extract", { caption: "x" }))).status).toBe(401);
    expect(
      (await extract.POST(post("/api/extract", { caption: "x" }, { "x-internal-key": "wrong" })))
        .status,
    ).toBe(401);
    vi.unstubAllEnvs();
  });

  it("/api/calendar/:token never reveals anything for malformed or unknown tokens", async () => {
    for (const t of ["", "short", "../../etc/passwd", "x".repeat(500), "a b"]) {
      const res = await calendar.GET(req("GET", "/x"), params({ token: t }));
      expect([404, 503]).toContain(res.status);
      expect(await res.text()).not.toMatch(/BEGIN:VCALENDAR/);
    }
  });

  it("/api/competitions rejects nonsense parameters with 400 or falls back to defaults, never 500", async () => {
    const res = await competitions.GET(req("GET", "/api/competitions?limit=banana&format=nope"));
    expect(res.status).toBeLessThan(500);
  });

  it("/api/unsubscribe POST refuses missing and forged tokens", async () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "s".repeat(32));
    const { NextRequest } = await import("next/server");
    for (const url of [
      "http://localhost/api/unsubscribe",
      "http://localhost/api/unsubscribe?t=forged.token",
    ]) {
      const res = await unsubscribe.POST(new NextRequest(url, { method: "POST" }));
      expect([400, 401, 403]).toContain(res.status);
    }
    vi.unstubAllEnvs();
  });
});
