import { describe, expect, it, vi } from "vitest";
import { cleanEmailBody, parseInbound, senderAddress, senderAllowed } from "@/lib/dept/inbound";
import { loadDeptConfig } from "@/lib/dept/config";
import { looksCompetitive, splitAnnouncements, splitParagraphs } from "@/lib/dept/split";
import { loadDeptEmail, loadDeptPageHtml } from "@/lib/fixtures";
import { runExtraction } from "@/lib/extract/service";
import {
  type DeptItem,
  type InboxMessage,
  type IngestDeptStore,
  runIngestDept,
} from "@/lib/jobs/ingest-dept";
import { ingestPost } from "@/lib/pipeline/ingest-post";
import type { PublishStore } from "@/lib/pipeline/publish";
import { mockVision } from "@/lib/sources/mock/adapters";
import { Chaos } from "@/lib/sources/mock/chaos";

vi.mock("server-only", () => ({}));

describe("splitting announcements", () => {
  it("keeps only competitive-looking articles from the fixture page", () => {
    const items = splitAnnouncements(loadDeptPageHtml());
    expect(items).toHaveLength(2);
    expect(items.some((t) => t.includes("Venture Challenge"))).toBe(true);
    expect(items.some((t) => /parking/i.test(t))).toBe(false);
  });
  it("falls back to list items, then to text blocks", () => {
    expect(
      splitAnnouncements(
        "<ul><li>Join the Spring Hackathon: register by March 3 and win prizes up to $500.</li><li>Cafeteria hours</li></ul>",
      ),
    ).toHaveLength(1);
    expect(
      splitAnnouncements(
        "Intro line\n\nThe Case Competition registration closes March 3 and teams of four compete for prizes.",
      ),
    ).toHaveLength(1);
  });
  it("ignores short, duplicate and non-competitive blocks; paragraphs split on blank lines", () => {
    expect(looksCompetitive("Parking update")).toBe(false);
    expect(
      splitParagraphs(
        "Hackathon!\n\nWe host a hackathon on Saturday. Register to compete for prizes.\n\nWe host a hackathon on Saturday. Register to compete for prizes.",
      ),
    ).toHaveLength(1);
  });
});

describe("inbound email parsing", () => {
  it("extracts and checks the sender address", () => {
    expect(senderAddress("Career Center <News@JSOM.utdallas.edu>")).toBe("news@jsom.utdallas.edu");
    expect(senderAddress("garbage")).toBeNull();
    const allow = ["jsom.utdallas.edu", "boss@club.org"];
    expect(senderAllowed("x <a@jsom.utdallas.edu>", allow)).toBe(true);
    expect(senderAllowed("a@sub.jsom.utdallas.edu", allow)).toBe(true);
    expect(senderAllowed("boss@club.org", allow)).toBe(true);
    expect(senderAllowed("a@evil-jsom.utdallas.edu.attacker.com", allow)).toBe(false);
    expect(senderAllowed("someone@club.org", allow)).toBe(false);
    expect(senderAllowed("no address", allow)).toBe(false);
  });
  it("cleans quoted replies, signatures and unsubscribe footers", () => {
    expect(cleanEmailBody("Hello\n> quoted Hackathon\nReal line\n-- \nSig\nUnsubscribe: x")).toBe(
      "Hello\nReal line",
    );
    expect(cleanEmailBody("Body\nUnsubscribe here\nMore")).toBe("Body\nMore");
  });
  it("normalizes Postmark, Resend and SendGrid shaped payloads", () => {
    const want = { from: "a@utdallas.edu", subject: "S", body: "Hello there", messageId: "m1" };
    expect(
      parseInbound({
        From: "a@utdallas.edu",
        Subject: "S",
        TextBody: "Hello there",
        MessageID: "m1",
      }),
    ).toEqual(want);
    expect(
      parseInbound({
        from: "a@utdallas.edu",
        subject: "S",
        html: "<p>Hello there</p>",
        message_id: "m1",
      }),
    ).toMatchObject({ body: expect.stringContaining("Hello there") });
    expect(
      parseInbound({
        sender: "a@utdallas.edu",
        Subject: "S",
        "body-plain": "Hello there",
        "Message-Id": "m1",
      }),
    ).toEqual(want);
  });
  it("rejects payloads with no sender, body or message id", () => {
    expect(parseInbound({ subject: "x", text: "y", messageId: "z" })).toBeNull();
    expect(parseInbound({ from: "a@b.edu", messageId: "z" })).toBeNull();
    expect(parseInbound({ from: "a@b.edu", text: "y" })).toBeNull();
    expect(parseInbound("nope")).toBeNull();
  });
  it("the committed config validates and lists the sample senders", () => {
    const c = loadDeptConfig("extra.edu, boss@club.org");
    expect(c.pages.length).toBeGreaterThan(0);
    expect(c.senders).toEqual(
      expect.arrayContaining(["jsom.utdallas.edu", "extra.edu", "boss@club.org"]),
    );
  });
});

function setup(over: { html?: string; messages?: InboxMessage[] } = {}) {
  const ledger = new Map<string, string>();
  const hashes = new Map<string, string>();
  const processed: string[] = [];
  const store: IngestDeptStore = {
    getPageHash: async (id) => hashes.get(id) ?? null,
    setPageHash: async (id, h) => void hashes.set(id, h),
    knownIds: async (ids) => new Set(ids.filter((i) => ledger.has(i))),
    record: async ({ id, result }) => void ledger.set(id, result.class),
    listUnprocessed: async () => (over.messages ?? []).filter((m) => !processed.includes(m.id)),
    markProcessed: async (id) => void processed.push(id),
  };
  return { store, ledger, hashes, processed };
}

const quiet = new Chaos({
  latencyMs: [0, 0],
  malformedRate: 0,
  timeoutRate: 0,
  rateLimitAtCall: 0,
  sleep: async () => {},
});
function realProcess(published: string[]) {
  const store = {
    publishCompetition: async (i: Parameters<PublishStore["publishCompetition"]>[0]) => {
      published.push(i.competition.title);
      return { id: `c${published.length}`, slug: "s" };
    },
    listOrgs: async () => [],
  } as unknown as PublishStore;
  const extractDeps = {
    vision: mockVision(quiet),
    mode: "mock" as const,
    maxImages: 3,
    resolveImage: async () => Buffer.alloc(0),
  };
  return (item: DeptItem) =>
    ingestPost(
      { images: [], caption: item.text, posted_at: item.postedAt },
      {
        source: "dept",
        source_url: item.sourceUrl,
        external_id: item.externalId,
        posted_at: item.postedAt,
        caption: item.text,
      },
      {
        extract: (req) => runExtraction(req, extractDeps),
        dedupe: async () => ({ action: "new", embedding: null, deferred: true }),
        store,
      },
    );
}
const page = { id: "jsom-news", name: "JSOM", url: "https://jsom.example/news", host: "JSOM" };
const email = (): InboxMessage => {
  const m = loadDeptEmail();
  return {
    id: "m-1",
    messageId: m.messageId,
    sender: m.from,
    subject: m.subject,
    body: m.text
      .split("\n")
      .filter((l) => !l.startsWith(">"))
      .join("\n"),
    receivedAt: "2026-11-10T12:00:00Z",
  };
};

describe("runIngestDept (fixtures + mock model)", () => {
  it("the fixture page and the fixture newsletter produce listings", async () => {
    const published: string[] = [];
    const t = setup({ messages: [email()] });
    const s = await runIngestDept({
      pages: [page],
      fetchPage: async () => loadDeptPageHtml(),
      store: t.store,
      process: realProcess(published),
    });
    expect(published.sort()).toEqual([
      "Analytics Showdown",
      "JSOM Venture Challenge",
      "SCM Case Competition",
    ]);
    expect(s).toMatchObject({ pages_checked: 1, messages: 1, published: 3, errors: 0 });
    expect(t.processed).toEqual(["m-1"]);
  });

  it("an unchanged page is skipped, and already-ingested announcements are never published twice", async () => {
    const published: string[] = [];
    const t = setup({ messages: [email()] });
    const run = () =>
      runIngestDept({
        pages: [page],
        fetchPage: async () => loadDeptPageHtml(),
        store: t.store,
        process: realProcess(published),
      });
    await run();
    const again = await run();
    expect(again).toMatchObject({ pages_unchanged: 1, published: 0, new: 0 });
    expect(published).toHaveLength(3);
    // a changed page re-reads, but known items are skipped by the ledger
    const changed = await runIngestDept({
      pages: [page],
      fetchPage: async () =>
        loadDeptPageHtml() + "<!-- updated -->".replace(/<!--.*-->/, "<p>Extra</p>"),
      store: t.store,
      process: realProcess(published),
    });
    expect(changed.published).toBe(0);
    expect(published).toHaveLength(3);
  });

  it("a page that cannot be fetched is skipped with an alert; the rest still runs", async () => {
    const t = setup({ messages: [email()] });
    const alert = vi.fn(async () => {});
    const published: string[] = [];
    const s = await runIngestDept({
      pages: [page, { ...page, id: "ecs", url: "https://ecs.example/news" }],
      fetchPage: async (url) => {
        if (url === page.url) throw new Error("HTTP 503");
        return loadDeptPageHtml();
      },
      store: t.store,
      process: realProcess(published),
      alert,
    });
    expect(s.pages_failed).toEqual(["jsom-news"]);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("JSOM"));
    expect(published).toHaveLength(3);
  });

  it("an item that fails keeps the page (and the email) pending for tomorrow", async () => {
    const t = setup({ messages: [email()] });
    let n = 0;
    const flaky = async (item: DeptItem) => {
      if (n++ === 0) throw new Error("groq down");
      return realProcess([])(item);
    };
    const s = await runIngestDept({
      pages: [page],
      fetchPage: async () => loadDeptPageHtml(),
      store: t.store,
      process: flaky,
    });
    expect(s.errors).toBe(1);
    expect(t.hashes.size).toBe(0);
    const retry = await runIngestDept({
      pages: [page],
      fetchPage: async () => loadDeptPageHtml(),
      store: t.store,
      process: realProcess([]),
    });
    expect(retry.errors).toBe(0);
    expect(t.hashes.size).toBe(1);
    expect(t.processed).toEqual(["m-1"]);
  });
});
