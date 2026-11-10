import { describe, expect, it } from "vitest";
import {
  type HandleStore,
  type OrgLite,
  importHandles,
  normalizeHandle,
  parseCsv,
} from "@/lib/admin/org-handles";

const orgs: OrgLite[] = [
  {
    id: "1",
    name: "Association for Information Systems",
    slug: "ais",
    utdclubs_slug: "ais-utd",
    ig_handle: null,
  },
  { id: "2", name: "ACM UTD", slug: "acm", utdclubs_slug: null, ig_handle: "acmutd" },
  { id: "3", name: "Comma, Inc", slug: "comma", utdclubs_slug: null, ig_handle: null },
];
function store() {
  const writes: [string, string | null, string][] = [];
  const s: HandleStore = {
    listOrgs: async () => orgs,
    setHandle: async (id, h, t) => void writes.push([id, h, t]),
  };
  return { s, writes };
}

describe("normalizeHandle", () => {
  it.each([
    ["@AIS_UTD", "ais_utd"],
    ["ais.utd", "ais.utd"],
    ["https://www.instagram.com/ais_utd/?hl=en", "ais_utd"],
    ["instagram.com/ais_utd", "ais_utd"],
  ])("%s -> %s", (i, o) => expect(normalizeHandle(i)).toBe(o));
  it.each([
    "",
    "  ",
    "has space",
    "https://instagram.com/p/ABC/",
    "a".repeat(31),
    "bad!char",
    null,
  ])("rejects %s", (i) => expect(normalizeHandle(i)).toBeNull());
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, BOM, blank lines and embedded commas", () => {
    expect(parseCsv('﻿club,instagram\r\n"Comma, Inc","@x""y"\r\n\r\nais,ais_utd\n')).toEqual([
      ["club", "instagram"],
      ["Comma, Inc", '@x"y'],
      ["ais", "ais_utd"],
    ]);
  });
});

describe("importHandles", () => {
  it("updates matching orgs by slug, UTD Clubs slug or exact name and marks nothing else", async () => {
    const { s, writes } = store();
    const r = await importHandles("club,instagram\nais,@ais_utd\n", s);
    expect(r).toMatchObject({ updated: 1, skipped: [] });
    expect(writes).toEqual([["1", "ais_utd", "unknown"]]);
    const b = store();
    await importHandles("ais-utd,ais_utd\nACM UTD,acm_new,business\n", b.s);
    expect(b.writes).toEqual([
      ["1", "ais_utd", "unknown"],
      ["2", "acm_new", "business"],
    ]);
  });

  it("reports every skipped row with its line and reason and keeps going", async () => {
    const { s, writes } = store();
    const r = await importHandles(
      "club,instagram,type\nnope,x\nais,not a handle\nais,ais_utd,weird\nais,ais_utd\nais,other\nComma\\, Inc,zzz\n",
      s,
    );
    expect(r.updated).toBe(1);
    expect(writes).toHaveLength(1);
    expect(r.skipped.map((x) => [x.line, x.reason.split(" ")[0]])).toEqual([
      [2, "No"],
      [3, "Not"],
      [4, "Account"],
      [6, "Organization"],
      [7, "No"],
    ]);
  });

  it("an unchanged handle is not rewritten (idempotent re-import)", async () => {
    const { s, writes } = store();
    expect(await importHandles("acm,@ACMUTD", s)).toMatchObject({ updated: 0, unchanged: 1 });
    expect(writes).toHaveLength(0);
  });

  it("header is optional and an empty file is a no-op; oversized input is refused", async () => {
    const { s } = store();
    expect(await importHandles("", s)).toEqual({ updated: 0, unchanged: 0, skipped: [] });
    expect((await importHandles("ais,ais_utd", s)).updated).toBe(1);
    const big = Array.from({ length: 2005 }, (_, i) => `x${i},y${i}`).join("\n");
    expect((await importHandles(big, s)).skipped[0].reason).toMatch(/Too many rows/);
  });
});
