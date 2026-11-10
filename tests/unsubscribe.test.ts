import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { applyUnsubscribe } from "@/lib/data/unsubscribe";
import {
  listUnsubscribeHeaders,
  signToken,
  unsubscribeSecret,
  unsubscribeUrl,
  verifyToken,
  type UnsubscribePayload,
} from "@/lib/unsubscribe";

const U = "00000000-0000-4000-8000-0000000000a1";
const C = "00000000-0000-4000-8000-0000000000c1";
const SECRET = "test-secret-at-least-16-chars";
const payloads: UnsubscribePayload[] = [
  { k: "comp", u: U, c: C },
  { k: "warnings", u: U },
  { k: "digest", u: U },
  { k: "sub", e: "student@gmail.com" },
];

describe("tokens", () => {
  it.each(payloads)("round-trips %j", (p) => {
    expect(verifyToken(signToken(p, SECRET), SECRET)).toEqual(p);
  });

  it("rejects a tampered payload, a tampered signature and the wrong secret", () => {
    const token = signToken({ k: "warnings", u: U }, SECRET);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ k: "warnings", u: "00000000-0000-4000-8000-0000000000ff" }),
    ).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyToken(`${body}.${sig.slice(0, -2)}AA`, SECRET)).toBeNull();
    expect(verifyToken(token, "a-different-secret-entirely")).toBeNull();
  });

  it.each(["", "abc", "a.b.c", ".", "a.", ".b", "%%%.%%%"])("rejects malformed token %j", (t) => {
    expect(verifyToken(t, SECRET)).toBeNull();
  });

  it("rejects a correctly signed token whose payload is not a known shape", () => {
    const body = Buffer.from(JSON.stringify({ k: "delete_account", u: U })).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
    expect(verifyToken(`${body}.${sig}`, SECRET)).toBeNull();
  });

  it("does not expire (links in old emails keep working)", () => {
    expect(verifyToken(signToken({ k: "digest", u: U }, SECRET), SECRET)).not.toBeNull();
  });
});

describe("secret", () => {
  it("uses the configured secret, a dev fallback outside production, and refuses to guess in production", () => {
    expect(unsubscribeSecret({ UNSUBSCRIBE_SECRET: "x".repeat(20) })).toBe("x".repeat(20));
    expect(unsubscribeSecret({})).toBe("dev-only-unsubscribe-secret");
    expect(() => unsubscribeSecret({ NODE_ENV: "production" })).toThrow(/required in production/);
    expect(() =>
      unsubscribeSecret({ NODE_ENV: "production", UNSUBSCRIBE_SECRET: "short" }),
    ).toThrow();
  });
});

describe("URLs and headers", () => {
  it("builds a page link and RFC 8058 one-click headers", () => {
    const url = unsubscribeUrl("https://cometarena.example/", { k: "warnings", u: U }, SECRET);
    expect(url.startsWith("https://cometarena.example/unsubscribe?t=")).toBe(true);
    const h = listUnsubscribeHeaders("https://cometarena.example", { k: "warnings", u: U }, SECRET);
    expect(h["List-Unsubscribe"]).toMatch(
      /^<https:\/\/cometarena\.example\/api\/unsubscribe\?t=.+>$/,
    );
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

/** Fake supabase client recording writes. */
function fakeDb(error: unknown = null) {
  const calls: [string, string, unknown][] = [];
  const db = {
    from: (table: string) => ({
      upsert: (row: unknown, opts: unknown) => (
        calls.push(["upsert", table, { row, opts }]),
        Promise.resolve({ error })
      ),
      update: (row: unknown) => ({
        eq: (col: string, val: string) => (
          calls.push(["update", table, { row, col, val }]),
          Promise.resolve({ error })
        ),
      }),
      delete: () => ({
        eq: (col: string, val: string) => (
          calls.push(["delete", table, { col, val }]),
          Promise.resolve({ error })
        ),
      }),
    }),
  };
  return { db: db as never, calls };
}

describe("applyUnsubscribe", () => {
  it("comp: mutes warnings for that competition only (idempotent upsert, save untouched)", async () => {
    const { db, calls } = fakeDb();
    await applyUnsubscribe(db, { k: "comp", u: U, c: C });
    expect(calls).toEqual([
      [
        "upsert",
        "warning_mutes",
        {
          row: { user_id: U, competition_id: C },
          opts: { onConflict: "user_id,competition_id", ignoreDuplicates: true },
        },
      ],
    ]);
  });

  it("warnings and digest flip only the matching flag on that user", async () => {
    const a = fakeDb();
    await applyUnsubscribe(a.db, { k: "warnings", u: U });
    expect(a.calls).toEqual([
      ["update", "users", { row: { email_warnings: false }, col: "id", val: U }],
    ]);
    const b = fakeDb();
    await applyUnsubscribe(b.db, { k: "digest", u: U });
    expect(b.calls).toEqual([["update", "users", { row: { digest: false }, col: "id", val: U }]]);
  });

  it("sub removes the subscriber by lowercased email", async () => {
    const { db, calls } = fakeDb();
    await applyUnsubscribe(db, { k: "sub", e: "Student@Gmail.com" });
    expect(calls).toEqual([
      ["delete", "email_subscribers", { col: "email", val: "student@gmail.com" }],
    ]);
  });

  it("surfaces database errors so the endpoint can answer 503", async () => {
    for (const p of payloads)
      await expect(applyUnsubscribe(fakeDb(new Error("db")).db, p)).rejects.toThrow("db");
  });
});
