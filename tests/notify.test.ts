import { describe, expect, it, vi } from "vitest";
import {
  type ClosingStage,
  type NewListing,
  TEST_MESSAGE,
  closingSoonMessage,
  esc,
  newListingsMessage,
} from "@/lib/notify/discord";
import {
  type PushStore,
  type StoredSubscription,
  pushToUser,
  subscriptionSchema,
  warningPush,
} from "@/lib/notify/push";
import { pushSupport, subscriptionJson, urlBase64ToBytes } from "@/lib/notify/push-client";
import { runNotifyDiscord, type NotifyDiscordStore } from "@/lib/jobs/notify-discord";
import { SourceError } from "@/lib/sources";
import { createDiscord, isDiscordWebhook } from "@/lib/sources/live/discord";
import { createWebPush } from "@/lib/sources/live/push";
import { mockDiscord, mockPush } from "@/lib/sources/mock/adapters";

const WEBHOOK = "https://discord.com/api/webhooks/123456789/abc-DEF_ghi";
const sub = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: "p".repeat(30), auth: "a".repeat(12) },
});

describe("discord formatting", () => {
  it("neutralizes mentions, markdown and links from untrusted titles", () => {
    expect(esc("@everyone **win** [click](https://evil.example)")).not.toMatch(
      /@everyone|https:\/\/evil/,
    );
    expect(esc("a_b*c`d`")).toBe("a\\_b\\*c\\`d\\`");
    expect(esc("x".repeat(500)).length).toBe(200);
  });
  const listing = (n: number): NewListing => ({
    id: `id${n}`,
    slug: `s${n}`,
    title: `Comp ${n}`,
    host: "AIS",
    categories: ["case_competition"],
    firstDeadline: "2026-11-20T23:59:00-06:00",
  });
  it("builds an embed per new competition with a link, host, deadline in Central Time and category", () => {
    const m = newListingsMessage([listing(1)], "https://app.example/");
    expect(m.content).toBe("New competition on Comet Arena");
    expect(m.embeds![0]).toMatchObject({ title: "Comp 1", url: "https://app.example/game/s1" });
    expect(m.embeds![0].description).toContain("Hosted by AIS");
    expect(m.embeds![0].description).toContain("Nov 20");
    expect(m.embeds![0].fields![0].value).toBe("case competition");
  });
  it("caps embeds at 5 and digest lines at 15", () => {
    expect(
      newListingsMessage(
        Array.from({ length: 8 }, (_, i) => listing(i)),
        "https://x",
      ).embeds,
    ).toHaveLength(5);
    const closing: ClosingStage[] = Array.from({ length: 20 }, (_, i) => ({
      stageId: `s${i}`,
      stageName: "Reg",
      deadline: "2026-11-12T20:00:00Z",
      title: `T${i}`,
      slug: `t${i}`,
    }));
    expect(closingSoonMessage(closing, "https://x").embeds![0].description).toContain(
      "…and 5 more",
    );
  });
});

describe("runNotifyDiscord", () => {
  const NOW = new Date("2026-11-10T14:00:00Z");
  const mkStore = (over: Partial<NotifyDiscordStore> = {}) => {
    const sent = new Set<string>();
    const store: NotifyDiscordStore = {
      newListings: async () => [
        { id: "n1", slug: "n1", title: "New One", host: null, categories: [], firstDeadline: null },
      ],
      closingStages: async () => [
        {
          stageId: "st1",
          stageName: "Reg",
          deadline: "2026-11-11T20:00:00Z",
          title: "Closing One",
          slug: "c1",
        },
      ],
      sentKeys: async (keys) => new Set(keys.filter((k) => sent.has(k))),
      markSent: async (keys) => void keys.forEach((k) => sent.add(k)),
      ...over,
    };
    return { store, sent };
  };
  it("posts new competitions and closing deadlines once, and nothing the next run", async () => {
    const discord = mockDiscord();
    const { store } = mkStore();
    const first = await runNotifyDiscord({ store, discord, appUrl: "https://x", now: NOW });
    expect(first).toMatchObject({ new_posted: 1, closing_posted: 1, messages: 2 });
    expect(discord.posted).toHaveLength(2);
    const second = await runNotifyDiscord({ store, discord, appUrl: "https://x", now: NOW });
    expect(second).toMatchObject({
      new_posted: 0,
      closing_posted: 0,
      messages: 0,
      skipped_already_posted: 2,
    });
    expect(discord.posted).toHaveLength(2);
  });
  it("a failed post is not marked sent, so the next run retries it", async () => {
    const { store, sent } = mkStore();
    const discord = {
      post: vi.fn(async () => {
        throw new SourceError("discord", "unavailable");
      }),
    };
    await expect(
      runNotifyDiscord({ store, discord, appUrl: "https://x", now: NOW }),
    ).rejects.toThrow();
    expect(sent.size).toBe(0);
  });
  it("batches new listings five at a time and a quiet day posts nothing", async () => {
    const discord = mockDiscord();
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `n${i}`,
      slug: `n${i}`,
      title: `T${i}`,
      host: null,
      categories: [],
      firstDeadline: null,
    }));
    const { store } = mkStore({ newListings: async () => many, closingStages: async () => [] });
    expect(
      (await runNotifyDiscord({ store, discord, appUrl: "https://x", now: NOW })).messages,
    ).toBe(2);
    const quiet = mkStore({ newListings: async () => [], closingStages: async () => [] });
    expect(
      (
        await runNotifyDiscord({
          store: quiet.store,
          discord: mockDiscord(),
          appUrl: "https://x",
          now: NOW,
        })
      ).messages,
    ).toBe(0);
  });
  it("the test message is delivered through the mock channel", async () => {
    const d = mockDiscord();
    await d.post(TEST_MESSAGE);
    expect(d.posted[0].content).toContain("test message");
  });
});

describe("live discord sender", () => {
  const ok = { ok: true, status: 204, json: async () => ({}) } as Response;
  it("only accepts real Discord webhook URLs", () => {
    expect(isDiscordWebhook(WEBHOOK)).toBe(true);
    expect(isDiscordWebhook("https://evil.example/api/webhooks/1/x")).toBe(false);
    expect(isDiscordWebhook("http://discord.com/api/webhooks/1/x")).toBe(false);
    expect(isDiscordWebhook("")).toBe(false);
  });
  it("posts JSON with pings disabled, refuses a bad URL without any request, and retries a 429 once told to wait", async () => {
    const f = vi.fn(async () => ok);
    await createDiscord({ webhookUrl: WEBHOOK, fetchImpl: f as never }).post({
      content: "hi @everyone",
    });
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe(WEBHOOK);
    expect(JSON.parse(init.body).allowed_mentions).toEqual({ parse: [] });
    const never = vi.fn();
    await expect(
      createDiscord({ webhookUrl: "https://evil.example/x", fetchImpl: never as never }).post({
        content: "x",
      }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(never).not.toHaveBeenCalled();
    let n = 0;
    const rl = vi.fn(async () =>
      n++ === 0
        ? ({ ok: false, status: 429, json: async () => ({ retry_after: 0.01 }) } as Response)
        : ok,
    );
    await createDiscord({
      webhookUrl: WEBHOOK,
      fetchImpl: rl as never,
      sleep: async () => {},
    }).post({ content: "x" });
    expect(rl).toHaveBeenCalledTimes(2);
    const always = vi.fn(
      async () => ({ ok: false, status: 429, json: async () => ({}) }) as Response,
    );
    await expect(
      createDiscord({
        webhookUrl: WEBHOOK,
        fetchImpl: always as never,
        sleep: async () => {},
        retries: 1,
      }).post({ content: "x" }),
    ).rejects.toMatchObject({ kind: "rate_limit" });
  });
});

describe("web push", () => {
  const store = (subs: StoredSubscription[]) => {
    const removed: string[] = [];
    const s: PushStore = { listFor: async () => subs, remove: async (id) => void removed.push(id) };
    return { s, removed };
  };
  it("delivers to every device and deletes dead subscriptions (the test message is delivered)", async () => {
    const sender = mockPush();
    const { s, removed } = store([
      { id: "a", sub: sub("https://push.example/a") },
      { id: "b", sub: sub("https://push.example/gone") },
    ]);
    const r = await pushToUser({ sender, store: s }, "u1", { title: "T", body: "B", url: "/x" });
    expect(r).toEqual({ delivered: 1, removed: 1, failed: 0 });
    expect(removed).toEqual(["b"]);
    expect(sender.sent[0].payload.title).toBe("T");
  });
  it("a transient failure keeps the subscription", async () => {
    const { s, removed } = store([{ id: "a", sub: sub("https://push.example/a") }]);
    const r = await pushToUser(
      {
        sender: {
          send: async () => {
            throw new SourceError("push", "unavailable");
          },
        },
        store: s,
      },
      "u",
      { title: "T", body: "B", url: "/" },
    );
    expect(r).toEqual({ delivered: 0, removed: 0, failed: 1 });
    expect(removed).toEqual([]);
  });
  it("warning payload says when and links to the Game Day page", () => {
    expect(
      warningPush({ title: "Case Comp", stageName: "Registration", window: "d1", slug: "case" }),
    ).toMatchObject({
      title: "Registration closes tomorrow",
      body: "Case Comp",
      url: "/game/case",
    });
    expect(warningPush({ title: "x", stageName: "Reg", window: "d7", slug: "x" }).title).toBe(
      "Reg closes in 7 days",
    );
  });
  it("validates subscriptions (https endpoints, key sizes)", () => {
    expect(subscriptionSchema.safeParse(sub("https://push.example/a")).success).toBe(true);
    expect(subscriptionSchema.safeParse(sub("http://push.example/a")).success).toBe(false);
    expect(
      subscriptionSchema.safeParse({
        endpoint: "https://x.example",
        keys: { p256dh: "short", auth: "a".repeat(12) },
      }).success,
    ).toBe(false);
  });
  it("the live sender maps 404/410 to gone, 429 to rate_limit and other failures to unavailable", async () => {
    const mk = (statusCode?: number) =>
      createWebPush({
        publicKey: "k",
        privateKey: "p",
        subject: "mailto:a@b.c",
        send: async () => {
          if (statusCode) throw Object.assign(new Error("x"), { statusCode });
        },
      });
    expect(await mk().send(sub("https://e"), { title: "t", body: "b", url: "/" })).toBe("ok");
    expect(await mk(410).send(sub("https://e"), { title: "t", body: "b", url: "/" })).toBe("gone");
    expect(await mk(404).send(sub("https://e"), { title: "t", body: "b", url: "/" })).toBe("gone");
    await expect(
      mk(429).send(sub("https://e"), { title: "t", body: "b", url: "/" }),
    ).rejects.toMatchObject({ kind: "rate_limit" });
    await expect(
      mk(500).send(sub("https://e"), { title: "t", body: "b", url: "/" }),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("push client helpers", () => {
  it("detects support and permission", () => {
    expect(pushSupport({ hasServiceWorker: true, hasPushManager: true })).toBe("unsupported");
    expect(
      pushSupport({
        Notification: { permission: "granted" },
        hasServiceWorker: true,
        hasPushManager: false,
      }),
    ).toBe("unsupported");
    expect(
      pushSupport({
        Notification: { permission: "denied" },
        hasServiceWorker: true,
        hasPushManager: true,
      }),
    ).toBe("denied");
    expect(
      pushSupport({
        Notification: { permission: "default" },
        hasServiceWorker: true,
        hasPushManager: true,
      }),
    ).toBe("default");
    expect(
      pushSupport({
        Notification: { permission: "granted" },
        hasServiceWorker: true,
        hasPushManager: true,
      }),
    ).toBe("granted");
  });
  it("decodes URL-safe base64 VAPID keys", () => {
    expect([...urlBase64ToBytes("-_8")]).toEqual([251, 255]);
    expect(urlBase64ToBytes("").length).toBe(0);
  });
  it("extracts a subscription only when it has all parts", () => {
    expect(
      subscriptionJson({
        toJSON: () => ({ endpoint: "https://e", keys: { p256dh: "p", auth: "a" } }),
      }),
    ).toEqual({ endpoint: "https://e", keys: { p256dh: "p", auth: "a" } });
    expect(subscriptionJson({ toJSON: () => ({ endpoint: "https://e" }) })).toBeNull();
  });
});
