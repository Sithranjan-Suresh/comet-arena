import { describe, expect, it } from "vitest";
import { toDigestCompetition } from "@/lib/jobs/digest-store";
import {
  type DigestCompetition,
  type DigestDeps,
  type DigestUser,
  MAX_PER_SECTION,
  digestForSubscriber,
  digestForUser,
  relevance,
  runSendDigest,
  weekKey,
} from "@/lib/jobs/send-digest";
import { SourceError } from "@/lib/sources";
import { createMockMailer } from "@/lib/sources/mock/mailer";

const DAY = 86_400_000;
// Sunday Nov 15 2026, 6 PM CST
const NOW = new Date("2026-11-16T00:00:00Z");
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY).toISOString();

let n = 0;
const comp = (over: Partial<DigestCompetition> = {}): DigestCompetition => {
  n++;
  return {
    id: `c${n}`,
    slug: `comp-${n}`,
    title: `Comp ${n}`,
    host_name: "AIS",
    categories: ["case_competition"],
    created_at: iso(-30),
    status: "live",
    next_stage_name: "Registration",
    next_deadline_at: iso(30),
    eligibility: null,
    ...over,
  };
};
const user = (over: Partial<DigestUser> = {}): DigestUser => ({
  id: "u1",
  email: "ada@utdallas.edu",
  name: "Ada Lovelace",
  major: "Computer Science",
  class_year: "junior",
  interests: [],
  courses: [],
  ...over,
});

describe("weekKey", () => {
  it("is the Chicago Monday of that week, stable across the whole week", () => {
    expect(weekKey(new Date("2026-11-16T00:00:00Z"))).toBe("2026-11-09"); // Sun Nov 15 6 PM CST
    expect(weekKey(new Date("2026-11-16T06:30:00Z"))).toBe("2026-11-16"); // Mon Nov 16 12:30 AM CST
    expect(weekKey(new Date("2026-11-20T12:00:00Z"))).toBe("2026-11-16");
  });
});

describe("digestForUser", () => {
  it("lists competitions closing within 7 days with the user's saved ones first", () => {
    const savedLater = comp({ title: "Saved later", next_deadline_at: iso(5) });
    const unsavedSooner = comp({ title: "Unsaved sooner", next_deadline_at: iso(1) });
    const savedSooner = comp({ title: "Saved sooner", next_deadline_at: iso(2) });
    const tooFar = comp({ title: "Too far", next_deadline_at: iso(9) });
    const d = digestForUser(
      [savedLater, unsavedSooner, tooFar, savedSooner],
      user(),
      new Set([savedLater.id, savedSooner.id]),
      NOW,
    );
    expect(d.closingThisWeek.map((i) => i.title)).toEqual([
      "Saved sooner",
      "Saved later",
      "Unsaved sooner",
    ]);
    expect(d.closingThisWeek.map((i) => i.saved)).toEqual([true, true, false]);
  });

  it("ranks new competitions by the user's interests and eligibility, newest first among ties", () => {
    const match = comp({ title: "Hack match", categories: ["hackathon"], created_at: iso(-3) });
    const other = comp({ title: "Other", categories: ["design"], created_at: iso(-1) });
    const olderMatch = comp({
      title: "Older match",
      categories: ["hackathon"],
      created_at: iso(-6),
    });
    const d = digestForUser(
      [other, olderMatch, match],
      user({ interests: ["hackathon"] }),
      new Set(),
      NOW,
    );
    expect(d.newThisWeek.map((i) => i.title)).toEqual(["Hack match", "Older match", "Other"]);
  });

  it("leaves out new competitions the user is known to be ineligible for, and anything older than a week", () => {
    const finance = comp({
      title: "Finance only",
      created_at: iso(-1),
      eligibility: {
        majors: ["Finance"],
        class_years: [],
        course_prereqs: [],
        cross_school: false,
      },
    });
    const open = comp({ title: "Open", created_at: iso(-1) });
    const old = comp({ title: "Old", created_at: iso(-10) });
    const d = digestForUser(
      [finance, open, old],
      user({ major: "Computer Science" }),
      new Set(),
      NOW,
    );
    expect(d.newThisWeek.map((i) => i.title)).toEqual(["Open"]);
  });

  it("does not repeat an item in both sections, and caps each section", () => {
    const both = comp({ title: "Both", created_at: iso(-1), next_deadline_at: iso(2) });
    const many = Array.from({ length: 12 }, (_, i) =>
      comp({ title: `New ${i}`, created_at: iso(-1) }),
    );
    const d = digestForUser([both, ...many], user(), new Set(), NOW);
    expect(d.closingThisWeek.map((i) => i.title)).toEqual(["Both"]);
    expect(d.newThisWeek.some((i) => i.title === "Both")).toBe(false);
    expect(d.newThisWeek).toHaveLength(MAX_PER_SECTION);
  });

  it("includes announced-but-undated (expected) competitions as new, but not past ones with no deadline", () => {
    const expected = comp({
      title: "Expected",
      status: "expected",
      next_stage_name: null,
      next_deadline_at: null,
      created_at: iso(-1),
    });
    const dead = comp({
      title: "No dates",
      status: "live",
      next_stage_name: null,
      next_deadline_at: null,
      created_at: iso(-1),
    });
    expect(
      digestForUser([expected, dead], user(), new Set(), NOW).newThisWeek.map((i) => i.title),
    ).toEqual(["Expected"]);
  });
});

describe("relevance", () => {
  it("scores 2 per matching interest and 1 for qualifying", () => {
    const c = comp({ categories: ["hackathon", "design"] });
    expect(relevance(c, user({ interests: ["hackathon", "design"] }))).toBe(5);
    expect(relevance(c, user({ interests: ["hackathon"] }))).toBe(3);
    expect(relevance(c, user())).toBe(1);
  });
});

describe("digestForSubscriber", () => {
  it("is unranked: closing by deadline, new by recency, no saved markers", () => {
    const a = comp({ title: "A", created_at: iso(-5), next_deadline_at: iso(30) });
    const b = comp({ title: "B", created_at: iso(-1), next_deadline_at: iso(30) });
    const closing = comp({ title: "Closing", next_deadline_at: iso(3) });
    const d = digestForSubscriber([a, b, closing], NOW);
    expect(d.closingThisWeek.map((i) => i.title)).toEqual(["Closing"]);
    expect(d.newThisWeek.map((i) => i.title)).toEqual(["B", "A"]);
    expect(d.closingThisWeek.every((i) => !i.saved)).toBe(true);
  });
});

function deps(
  over: Partial<DigestDeps> & {
    competitions?: DigestCompetition[];
    users?: DigestUser[];
    subscribers?: string[];
    saved?: Map<string, Set<string>>;
  } = {},
) {
  const mailer = createMockMailer();
  const sleeps: number[] = [];
  const d: DigestDeps = {
    loadCompetitions: async () => over.competitions ?? [],
    loadUsers: async () => over.users ?? [],
    loadSaved: async () => over.saved ?? new Map(),
    loadSubscribers: async () => over.subscribers ?? [],
    mailer,
    appUrl: "https://cometarena.example",
    unsubscribe: {
      userUrl: (u) => `https://cometarena.example/unsubscribe?t=digest-${u}`,
      userHeaders: (u) => ({
        "List-Unsubscribe": `<https://cometarena.example/api/unsubscribe?t=digest-${u}>`,
      }),
      subscriberUrl: (e) => `https://cometarena.example/unsubscribe?t=sub-${e}`,
      subscriberHeaders: (e) => ({
        "List-Unsubscribe": `<https://cometarena.example/api/unsubscribe?t=sub-${e}>`,
      }),
    },
    now: NOW,
    sleep: async (ms) => void sleeps.push(ms),
    paceMs: 0,
    ...over,
  };
  return { d, mailer, sleeps };
}

describe("runSendDigest", () => {
  it("emails account holders a ranked digest and subscribers the unranked one", async () => {
    const closing = comp({ title: "Closing Soon", next_deadline_at: iso(2) });
    const fresh = comp({ title: "Brand New", created_at: iso(-1) });
    const { d, mailer } = deps({
      competitions: [closing, fresh],
      users: [user()],
      saved: new Map([["u1", new Set([closing.id])]]),
      subscribers: ["Fan@Gmail.com"],
    });
    const r = await runSendDigest(d);
    expect(r).toMatchObject({ users: 1, subscribers: 1, sent: 2, failed: 0, skippedEmpty: 0 });

    const [toUser, toFan] = mailer.sent;
    expect(toUser.to).toBe("ada@utdallas.edu");
    expect(toUser.html).toContain("★ Closing Soon");
    expect(toUser.html).toContain("Open your Scouting Report");
    expect(toUser.html).toContain("unsubscribe?t=digest-u1");
    expect(toFan.to).toBe("fan@gmail.com"); // normalized
    expect(toFan.html).not.toContain("★");
    expect(toFan.html).toContain("Sign in to save and get warnings");
    expect(toFan.html).toContain("unsubscribe?t=sub-fan@gmail.com");
  });

  it("skips recipients whose digest would be empty (no spam)", async () => {
    const { d, mailer } = deps({
      competitions: [comp({ created_at: iso(-30), next_deadline_at: iso(40) })],
      users: [user()],
      subscribers: ["fan@gmail.com"],
    });
    const r = await runSendDigest(d);
    expect(r).toMatchObject({ sent: 0, skippedEmpty: 2 });
    expect(mailer.sent).toHaveLength(0);
  });

  it("uses one idempotency key per recipient per week, so a re-run the same week sends nothing new", async () => {
    const { d, mailer } = deps({
      competitions: [comp({ next_deadline_at: iso(2) })],
      users: [user()],
      subscribers: ["fan@gmail.com"],
    });
    await runSendDigest(d);
    await runSendDigest(d);
    expect(mailer.sent).toHaveLength(2);
    expect(mailer.sent.map((m) => m.idempotencyKey)).toEqual([
      "digest:u1:2026-11-09",
      "digest:sub:fan@gmail.com:2026-11-09",
    ]);
    // next week gets a fresh key
    const next = deps({
      competitions: [comp({ next_deadline_at: iso(9) })],
      users: [user()],
      now: new Date(NOW.getTime() + 7 * DAY),
    });
    await runSendDigest({ ...next.d, mailer });
    expect(mailer.sent.at(-1)!.idempotencyKey).toBe("digest:u1:2026-11-16");
  });

  it("a failing recipient does not stop the others, and is reported", async () => {
    const mailer = createMockMailer({
      failFor: (m) => (m.to === "bad@utdallas.edu" ? new SourceError("resend", "malformed") : null),
    });
    const { d } = deps({
      competitions: [comp({ next_deadline_at: iso(2) })],
      users: [
        user({ id: "ubad", email: "bad@utdallas.edu" }),
        user({ id: "ugood", email: "good@utdallas.edu" }),
      ],
    });
    const r = await runSendDigest({ ...d, mailer });
    expect(r).toMatchObject({ sent: 1, failed: 1 });
    expect(r.errors[0].to).toBe("bad@utdallas.edu");
  });

  it("paces sends and loads saves only when there are users", async () => {
    let savedCalls = 0;
    const { d, sleeps } = deps({
      competitions: [comp({ next_deadline_at: iso(2) })],
      subscribers: ["a@x.com", "b@x.com", "c@x.com"],
      paceMs: 600,
      loadSaved: async () => (savedCalls++, new Map()),
    });
    await runSendDigest(d);
    expect(sleeps).toEqual([600, 600]);
    expect(savedCalls).toBe(0);
  });

  it("propagates a database failure (the job must show as failed, not silently send nothing)", async () => {
    const { d } = deps({
      loadCompetitions: async () => {
        throw new Error("db down");
      },
    });
    await expect(runSendDigest(d)).rejects.toThrow("db down");
  });
});

describe("toDigestCompetition", () => {
  it("picks the next upcoming stage and tolerates missing relations", () => {
    const c = toDigestCompetition(
      {
        id: "x",
        slug: "s",
        title: "T",
        host_name: null,
        categories: [],
        created_at: iso(-1),
        status: "live",
        eligibility: [{ majors: [], class_years: [], course_prereqs: [], cross_school: false }],
        stages: [
          { name: "Past", deadline_at: iso(-3) },
          { name: "Later", deadline_at: iso(9) },
          { name: "Soon", deadline_at: iso(2) },
        ],
      },
      NOW,
    );
    expect(c).toMatchObject({ next_stage_name: "Soon", next_deadline_at: iso(2) });
    expect(c.eligibility).not.toBeNull();
    expect(
      toDigestCompetition(
        {
          id: "x",
          slug: "s",
          title: "T",
          host_name: null,
          categories: [],
          created_at: iso(0),
          status: "expected",
          stages: null,
          eligibility: null,
        },
        NOW,
      ),
    ).toMatchObject({ next_deadline_at: null, eligibility: null });
  });
});
