import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type OrgRecord, normalizeHandle, snapshotSchema } from "@/lib/orgs/merge";
import { type OrgStore, syncOrgs } from "@/lib/orgs/sync";

class MemoryStore implements OrgStore {
  rows = new Map<string, OrgRecord>();
  async loadAll() {
    return [...this.rows.values()].map((r) => structuredClone(r));
  }
  async upsertMany(rows: OrgRecord[]) {
    for (const r of rows) this.rows.set(r.slug, structuredClone(r));
  }
}

const snapshot = snapshotSchema.parse(
  JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, "../fixtures/utdclubs-snapshot.json"), "utf8"),
  ),
);

describe("normalizeHandle", () => {
  it.each([
    ["@HackUTD", "hackutd"],
    ["https://www.instagram.com/ais_utd/?hl=en", "ais_utd"],
    ["instagram.com/some.club/", "some.club"],
    ["  ", null],
    [null, null],
    ["not a handle!!", null],
  ])("%s -> %s", (input, expected) => expect(normalizeHandle(input)).toBe(expected));
});

describe("syncOrgs", () => {
  it("loads the snapshot and is idempotent", async () => {
    const store = new MemoryStore();
    const first = await syncOrgs(store, snapshot.clubs);
    expect(first.inserted).toBe(snapshot.clubs.length);
    const before = JSON.stringify(await store.loadAll());
    const second = await syncOrgs(store, snapshot.clubs);
    expect(second).toMatchObject({ inserted: 0, updated: 0, unchanged: snapshot.clubs.length });
    expect(JSON.stringify(await store.loadAll())).toBe(before);
  });

  it("never overwrites a manually entered handle", async () => {
    const store = new MemoryStore();
    await syncOrgs(store, [{ slug: "ais", name: "AIS", tags: [], instagram: "old_ais" }]);
    store.rows.get("ais")!.ig_handle = "ais_utd_manual";
    store.rows.get("ais")!.handle_manual = true;
    await syncOrgs(store, [{ slug: "ais", name: "AIS", tags: [], instagram: "different" }]);
    expect(store.rows.get("ais")!.ig_handle).toBe("ais_utd_manual");
  });

  it("updates an automatic handle and keeps it if the source drops it", async () => {
    const store = new MemoryStore();
    await syncOrgs(store, [{ slug: "x", name: "X", tags: [], instagram: "first" }]);
    await syncOrgs(store, [{ slug: "x", name: "X", tags: [], instagram: "second" }]);
    expect(store.rows.get("x")!.ig_handle).toBe("second");
    await syncOrgs(store, [{ slug: "x", name: "X", tags: [], instagram: null }]);
    expect(store.rows.get("x")!.ig_handle).toBe("second");
  });

  it("ignores duplicate slugs in the source", async () => {
    const store = new MemoryStore();
    const r = await syncOrgs(store, [
      { slug: "a", name: "A", tags: [] },
      { slug: "a", name: "A again", tags: [] },
    ]);
    expect(r.total).toBe(1);
  });
});
