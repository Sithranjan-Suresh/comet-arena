import { describe, expect, it, vi } from "vitest";
import type { OrgRecord } from "@/lib/orgs/merge";
import type { OrgStore } from "@/lib/orgs/sync";
import { OrgSyncRefused, SNAPSHOT_KEY, runOrgSync } from "@/lib/orgs/sync-job";
import { SourceError } from "@/lib/sources";
import { createUtdClubs, normalizeClub, unwrap } from "@/lib/sources/live/utdclubs";

const club = (n: number) => ({ slug: `club-${n}`, name: `Club ${n}`, tags: [] as string[] });
const clubs = (n: number) => Array.from({ length: n }, (_, i) => club(i));
function store(initial: OrgRecord[] = []): OrgStore & { rows: Map<string, OrgRecord> } {
  const rows = new Map(initial.map((o) => [o.slug, o]));
  return {
    rows,
    loadAll: async () => [...rows.values()],
    upsertMany: async (r) => void r.forEach((o) => rows.set(o.slug, o)),
  };
}
const existing = (n: number): OrgRecord[] =>
  clubs(n).map((c) => ({
    slug: c.slug,
    name: c.name,
    utdclubs_slug: c.slug,
    campusgroups_id: null,
    ig_handle: null,
    discord_url: null,
    tags: [],
    handle_manual: false,
  }));

describe("runOrgSync (guarded)", () => {
  it("syncs and refreshes the cached snapshot", async () => {
    const cache = { save: vi.fn(async () => {}) };
    const r = await runOrgSync({ fetchClubs: async () => clubs(60), store: store(), cache });
    expect(r).toMatchObject({ inserted: 60, total: 60 });
    expect(cache.save).toHaveBeenCalledWith(
      SNAPSHOT_KEY,
      expect.objectContaining({ clubs: expect.any(Array) }),
    );
  });

  it("an empty list keeps everything and fails so the admin is alerted", async () => {
    const s = store(existing(60));
    const cache = { save: vi.fn(async () => {}) };
    await expect(
      runOrgSync({ fetchClubs: async () => [], store: s, cache }),
    ).rejects.toBeInstanceOf(OrgSyncRefused);
    expect(cache.save).not.toHaveBeenCalled();
    expect(s.rows.size).toBe(60);
  });

  it("a sharply shrunken list is refused and the last cache is kept", async () => {
    const s = store(existing(100));
    const cache = { save: vi.fn(async () => {}) };
    await expect(
      runOrgSync({ fetchClubs: async () => clubs(20), store: s, cache }),
    ).rejects.toThrow(/kept the previous/);
    expect(cache.save).not.toHaveBeenCalled();
  });

  it("a small first-ever sync is allowed (fresh database)", async () => {
    const r = await runOrgSync({
      fetchClubs: async () => clubs(5),
      store: store(),
      cache: { save: async () => {} },
    });
    expect(r.inserted).toBe(5);
  });

  it("preserves manually entered handles", async () => {
    const s = store([{ ...existing(1)[0], ig_handle: "mine", handle_manual: true }]);
    await runOrgSync({
      fetchClubs: async () => [{ ...club(0), instagram: "theirs" }],
      store: s,
      cache: { save: async () => {} },
      minClubs: 1,
    });
    expect(s.rows.get("club-0")!.ig_handle).toBe("mine");
  });
});

describe("live UTD Clubs adapter", () => {
  const json = (body: unknown, status = 200) =>
    ({ ok: status < 300, status, headers: new Headers(), json: async () => body }) as Response;
  const mk = (fetchImpl: typeof fetch) =>
    createUtdClubs({ fetchImpl, sleep: async () => {}, apiKey: "k" });

  it("unwraps tRPC envelopes and normalizes", () => {
    expect(unwrap({ result: { data: { json: [1] } } })).toEqual([1]);
    expect(unwrap([2])).toEqual([2]);
    expect(normalizeClub({ id: "x", name: "X", instagram: " ig " })).toMatchObject({
      slug: "x",
      instagram: "ig",
    });
    expect(normalizeClub({ nope: 1 })).toBeNull();
  });

  it("lists clubs then enriches each with directory info", async () => {
    const f = vi.fn(async (url: string) =>
      url.includes("club.all")
        ? json([
            { slug: "a", name: "A" },
            { slug: "b", name: "B" },
          ])
        : json({
            result: {
              data: { instagram: decodeURIComponent(url).includes('"a"') ? "a_ig" : null },
            },
          }),
    );
    const out = await mk(f as unknown as typeof fetch).fetchClubs();
    expect(out.map((c) => c.slug)).toEqual(["a", "b"]);
    expect(out[0].instagram).toBe("a_ig");
    expect((f.mock.calls[0] as unknown[])[1]).toMatchObject({ headers: { "x-api-key": "k" } });
  });

  it("a detail failure keeps the list-level club", async () => {
    const f = vi.fn(async (url: string) =>
      url.includes("club.all") ? json([{ slug: "a", name: "A" }]) : json({}, 500),
    );
    expect((await mk(f as unknown as typeof fetch).fetchClubs()).map((c) => c.slug)).toEqual(["a"]);
  });

  it("schema drift (most rows unrecognizable) is a malformed error, not a silent empty sync", async () => {
    const f = vi.fn(async () => json([{ foo: 1 }, { bar: 2 }, { slug: "a", name: "A" }]));
    await expect(mk(f as unknown as typeof fetch).fetchClubs()).rejects.toMatchObject({
      kind: "malformed",
    });
  });

  it("maps outages and rate limits to typed errors", async () => {
    await expect(
      mk((async () => json({}, 429)) as unknown as typeof fetch).fetchClubs(),
    ).rejects.toMatchObject({ kind: "rate_limit" });
    await expect(
      mk((async () => {
        throw new Error("net");
      }) as unknown as typeof fetch).fetchClubs(),
    ).rejects.toBeInstanceOf(SourceError);
    await expect(
      mk((async () => json({ not: "a list" })) as unknown as typeof fetch).fetchClubs(),
    ).rejects.toMatchObject({ kind: "malformed" });
  });
});
