import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state: { user: { id: string } | null; isAdmin: boolean | null } = {
  user: null,
  isAdmin: false,
};
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: state.isAdmin === null ? null : { is_admin: state.isAdmin },
          }),
        }),
      }),
    }),
  }),
}));
import { requireApiAdmin } from "@/lib/auth/api";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://x");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "k");
});
afterEach(() => vi.unstubAllEnvs());

describe("requireApiAdmin", () => {
  it("signed out: 401", async () => {
    state.user = null;
    const r = await requireApiAdmin();
    expect(r.ok === false && r.response.status).toBe(401);
  });
  it("signed in but not an admin: 403", async () => {
    state.user = { id: "u" };
    state.isAdmin = false;
    const r = await requireApiAdmin();
    expect(r.ok === false && r.response.status).toBe(403);
  });
  it("missing profile row is also 403", async () => {
    state.user = { id: "u" };
    state.isAdmin = null;
    const r = await requireApiAdmin();
    expect(r.ok === false && r.response.status).toBe(403);
  });
  it("admin: allowed", async () => {
    state.user = { id: "u" };
    state.isAdmin = true;
    expect((await requireApiAdmin()).ok).toBe(true);
  });
});
