import { describe, expect, it, vi } from "vitest";
import { runClassifyAccounts } from "@/lib/jobs/classify-accounts";
import type { IgOrg } from "@/lib/jobs/ingest-instagram";
import { SourceError } from "@/lib/sources";

const org = (id: string): IgOrg => ({
  id,
  name: id,
  ig_handle: id,
  ig_account_type: "personal_or_missing",
});
const run = (orgs: IgOrg[], fetch: (h: string) => Promise<unknown>) => {
  const types = new Map<string, string>();
  const p = runClassifyAccounts({
    store: {
      listPersonal: async () => orgs,
      setAccountType: async (id, t) => void types.set(id, t),
    },
    instagram: { fetchRecentPosts: vi.fn(fetch as never) },
    sleep: async () => {},
  });
  return { p, types };
};

describe("classify-accounts", () => {
  it("flips an account type when Business Discovery now works", async () => {
    const { p, types } = run([org("a"), org("b")], async (h) =>
      h === "a" ? { status: "ok", posts: [] } : { status: "no_account" },
    );
    expect(await p).toMatchObject({ checked: 2, upgraded: 1, still_personal: 1 });
    expect(types.get("a")).toBe("business");
    expect(types.has("b")).toBe(false);
  });

  it("a quota stop is incomplete, not an error; other failures are counted and skipped", async () => {
    const { p } = run([org("a"), org("b"), org("c")], async (h) => {
      if (h === "a") throw new SourceError("instagram", "unavailable");
      if (h === "b") throw new SourceError("instagram", "rate_limit");
      return { status: "ok", posts: [] };
    });
    expect(await p).toMatchObject({ errors: 1, incomplete: true, upgraded: 0 });
  });
});
