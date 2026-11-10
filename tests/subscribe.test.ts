import { describe, expect, it } from "vitest";
import { createRateLimiter, clientIp } from "@/lib/rate-limit";
import {
  CONFIRMATION_COOLDOWN_MS,
  type SubscribeStore,
  type SubscriberRow,
  confirmSubscription,
  startSubscription,
  subscribeInputSchema,
} from "@/lib/subscribe";
import { createMockMailer } from "@/lib/sources/mock/mailer";

const TOKEN = "ab".repeat(16);
const NOW = new Date("2026-11-10T15:00:00Z");

function memoryStore(
  seed: SubscriberRow[] = [],
): SubscribeStore & { rows: Map<string, SubscriberRow> } {
  const rows = new Map(seed.map((r) => [r.email, { ...r }]));
  return {
    rows,
    async get(email) {
      return rows.get(email) ?? null;
    },
    async create(email) {
      const row = { email, confirm_token: TOKEN, confirmed_at: null, confirmation_sent_at: null };
      rows.set(email, row);
      return row;
    },
    async markConfirmationSent(email, at) {
      rows.get(email)!.confirmation_sent_at = at.toISOString();
    },
    async confirmByToken(token, at) {
      const row = [...rows.values()].find((r) => r.confirm_token === token);
      if (!row) return false;
      row.confirmed_at ??= at.toISOString();
      return true;
    },
  };
}
const setup = (seed: SubscriberRow[] = []) => {
  const store = memoryStore(seed);
  const mailer = createMockMailer();
  return { store, mailer, deps: { store, mailer, appUrl: "https://cometarena.example", now: NOW } };
};

describe("subscribeInputSchema", () => {
  it("normalizes email and rejects junk or a filled honeypot", () => {
    expect(subscribeInputSchema.parse({ email: "  Fan@Gmail.COM " }).email).toBe("fan@gmail.com");
    for (const bad of [
      { email: "nope" },
      { email: "" },
      {},
      { email: "a@b.co", website: "http://spam" },
      { email: "a".repeat(250) + "@x.com" },
    ]) {
      expect(subscribeInputSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("startSubscription", () => {
  it("creates an unconfirmed subscriber and sends one confirmation email with the token link", async () => {
    const { deps, mailer, store } = setup();
    expect(await startSubscription({ email: "Fan@Gmail.com" }, deps)).toBe("sent");
    expect(store.rows.get("fan@gmail.com")).toMatchObject({
      confirmed_at: null,
      confirmation_sent_at: NOW.toISOString(),
    });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe("fan@gmail.com");
    expect(mailer.sent[0].text).toContain(
      `https://cometarena.example/subscribe/confirm?t=${TOKEN}`,
    );
    expect(mailer.sent[0].subject).toBe("Confirm your Comet Arena Weekly subscription");
  });

  it("does not email people who are already confirmed", async () => {
    const { deps, mailer } = setup([
      {
        email: "fan@gmail.com",
        confirm_token: TOKEN,
        confirmed_at: "2026-11-01T00:00:00Z",
        confirmation_sent_at: null,
      },
    ]);
    expect(await startSubscription({ email: "fan@gmail.com" }, deps)).toBe("already_confirmed");
    expect(mailer.sent).toHaveLength(0);
  });

  it("enforces a cooldown so the form cannot flood an inbox, then allows a resend", async () => {
    const { deps, mailer } = setup();
    await startSubscription({ email: "fan@gmail.com" }, deps);
    expect(await startSubscription({ email: "fan@gmail.com" }, deps)).toBe("cooldown");
    expect(
      await startSubscription(
        { email: "fan@gmail.com" },
        { ...deps, now: new Date(NOW.getTime() + CONFIRMATION_COOLDOWN_MS - 1000) },
      ),
    ).toBe("cooldown");
    expect(
      await startSubscription(
        { email: "fan@gmail.com" },
        { ...deps, now: new Date(NOW.getTime() + CONFIRMATION_COOLDOWN_MS + 1000) },
      ),
    ).toBe("sent");
    expect(mailer.sent).toHaveLength(2);
  });

  it("silently ignores invalid input and bot submissions", async () => {
    const { deps, mailer } = setup();
    expect(await startSubscription({ email: "not-an-email" }, deps)).toBe("ignored");
    expect(await startSubscription({ email: "bot@x.com", website: "http://spam" }, deps)).toBe(
      "ignored",
    );
    expect(await startSubscription(null, deps)).toBe("ignored");
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("confirmSubscription", () => {
  it("confirms a valid token and is idempotent", async () => {
    const { deps, store } = setup();
    await startSubscription({ email: "fan@gmail.com" }, deps);
    expect(await confirmSubscription(TOKEN, deps)).toBe(true);
    const first = store.rows.get("fan@gmail.com")!.confirmed_at;
    expect(first).toBe(NOW.toISOString());
    expect(await confirmSubscription(TOKEN, { ...deps, now: new Date(NOW.getTime() + 1000) })).toBe(
      true,
    );
    expect(store.rows.get("fan@gmail.com")!.confirmed_at).toBe(first); // original time kept
  });

  it("rejects unknown and malformed tokens without touching the store", async () => {
    const { deps } = setup();
    expect(await confirmSubscription("cd".repeat(16), deps)).toBe(false);
    for (const bad of ["", "short", "G".repeat(32), "ab".repeat(17), null, undefined, 42])
      expect(await confirmSubscription(bad, deps), String(bad)).toBe(false);
  });
});

describe("rate limiter", () => {
  it("allows up to max per window per key, then blocks, then resets", () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 2 });
    expect([rl.allow("a", 0), rl.allow("a", 1), rl.allow("a", 2)]).toEqual([true, true, false]);
    expect(rl.allow("b", 3)).toBe(true); // independent keys
    expect(rl.allow("a", 1001)).toBe(true); // new window
  });

  it("stays bounded under many distinct keys", () => {
    const rl = createRateLimiter({ windowMs: 60_000, max: 1, maxKeys: 50 });
    for (let i = 0; i < 500; i++) expect(rl.allow(`k${i}`, i)).toBe(true);
    // the oldest keys were evicted, so they are allowed again instead of memory growing without bound
    expect(rl.allow("k0", 600)).toBe(true);
  });

  it("reads the client IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe(
      "203.0.113.5",
    );
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
