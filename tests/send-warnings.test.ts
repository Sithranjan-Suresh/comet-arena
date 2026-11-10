import { describe, expect, it, vi } from "vitest";
import {
  type Candidate,
  CATCH_UP_MS,
  type WarningsDeps,
  idempotencyKey,
  runSendWarnings,
  sentKey,
} from "@/lib/jobs/send-warnings";
import { SourceError } from "@/lib/sources";
import { createMockMailer } from "@/lib/sources/mock/mailer";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = new Date("2026-11-10T15:00:00Z");

let n = 0;
const cand = (over: Partial<Candidate> & { deadline: Date }): Candidate => {
  n++;
  const { deadline, ...rest } = over;
  return {
    stage_id: `stage-${n}`,
    stage_name: "Registration closes",
    deadline_at: deadline.toISOString(),
    competition_id: `comp-${n}`,
    title: "AIS Fall Case Competition",
    slug: "ais-fall-case",
    register_url: "https://example.com/r",
    user_id: `user-${n}`,
    email: `u${n}@utdallas.edu`,
    user_name: "Ada Lovelace",
    saved_at: new Date(T0.getTime() - 30 * DAY).toISOString(),
    ...rest,
  };
};

/** In-memory world: all saved stages plus a warnings_sent ledger. */
function world(all: Candidate[], mailerOpts?: Parameters<typeof createMockMailer>[0]) {
  const ledger = new Set<string>(); // "window:user:stage"
  const mailer = createMockMailer(mailerOpts);
  const sleeps: number[] = [];
  const deps = (now: Date, over: Partial<WarningsDeps> = {}): WarningsDeps => ({
    findCandidates: async (from, to) =>
      all.filter((c) => new Date(c.deadline_at) >= from && new Date(c.deadline_at) <= to),
    alreadySent: async (window, keys) =>
      new Set(
        keys
          .filter((k) => ledger.has(`${window}:${k.user_id}:${k.stage_id}`))
          .map((k) => sentKey(k.user_id, k.stage_id)),
      ),
    recordSent: async (r) => void ledger.add(`${r.window}:${r.user_id}:${r.stage_id}`),
    mailer,
    appUrl: "https://cometarena.example",
    unsubscribe: {
      competitionUrl: (u, c) => `https://cometarena.example/unsubscribe?t=comp-${u}-${c}`,
      allUrl: (u) => `https://cometarena.example/unsubscribe?t=all-${u}`,
      headers: (u) => ({
        "List-Unsubscribe": `<https://cometarena.example/api/unsubscribe?t=${u}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }),
    },
    now,
    sleep: async (ms) => void sleeps.push(ms),
    ...over,
  });
  return { ledger, mailer, sleeps, deps };
}

describe("runSendWarnings: windows", () => {
  it("sends the 7-day warning for a stage due in 7 days, and the 1-day warning for one due in 1 day", async () => {
    const c7 = cand({ deadline: new Date(T0.getTime() + 7 * DAY) });
    const c1 = cand({ deadline: new Date(T0.getTime() + 1 * DAY + 10 * 60_000) });
    const w = world([c7, c1]);
    const r = await runSendWarnings(w.deps(T0));
    expect(r.sent).toBe(2);
    expect(w.mailer.sent.map((m) => m.subject)).toEqual([
      "7 days left: AIS Fall Case Competition, Registration closes",
      "1 day left: AIS Fall Case Competition, Registration closes",
    ]);
  });

  it("does not warn about stages that are not due in a window (3 days, 30 days)", async () => {
    const w = world([
      cand({ deadline: new Date(T0.getTime() + 3 * DAY) }),
      cand({ deadline: new Date(T0.getTime() + 30 * DAY) }),
    ]);
    expect((await runSendWarnings(w.deps(T0))).sent).toBe(0);
  });

  it("sends exactly once as hourly runs march past the window (no duplicates, no gaps)", async () => {
    const stage = cand({ deadline: new Date(T0.getTime() + 7 * DAY + 20 * 60_000) });
    const w = world([stage]);
    for (let h = 0; h < 6; h++) await runSendWarnings(w.deps(new Date(T0.getTime() + h * HOUR)));
    expect(w.mailer.sent).toHaveLength(1);
  });

  it("every possible deadline minute gets exactly one 7-day warning across hourly runs", async () => {
    // Sweep deadlines across a day to prove the windows tile with the catch-up grace and the ledger.
    const stages = Array.from({ length: 48 }, (_, i) =>
      cand({ deadline: new Date(T0.getTime() + 7 * DAY + i * 30 * 60_000), user_id: `u${i}` }),
    );
    const w = world(stages);
    for (let h = 0; h < 40; h++) await runSendWarnings(w.deps(new Date(T0.getTime() + h * HOUR)));
    const bySubject = new Map<string, number>();
    for (const m of w.mailer.sent) bySubject.set(m.to, (bySubject.get(m.to) ?? 0) + 1);
    expect(w.mailer.sent.filter((m) => m.subject.startsWith("7 days"))).toHaveLength(48);
    expect([...bySubject.values()].every((c) => c <= 2)).toBe(true); // at most d7 + d1 per stage
  });
});

describe("runSendWarnings: idempotency", () => {
  it("running twice in the same hour sends once", async () => {
    const w = world([cand({ deadline: new Date(T0.getTime() + 7 * DAY) })]);
    expect((await runSendWarnings(w.deps(T0))).sent).toBe(1);
    const second = await runSendWarnings(w.deps(T0));
    expect(second).toMatchObject({ sent: 0, skippedAlreadySent: 1 });
    expect(w.mailer.sent).toHaveLength(1);
  });

  it("uses a stable idempotency key per user, stage and window", async () => {
    const c = cand({ deadline: new Date(T0.getTime() + 7 * DAY) });
    const w = world([c]);
    await runSendWarnings(w.deps(T0));
    expect(w.mailer.sent[0].idempotencyKey).toBe(idempotencyKey(c.user_id, c.stage_id, "d7"));
  });

  it("a crash between sending and recording cannot cause a second email", async () => {
    const c = cand({ deadline: new Date(T0.getTime() + 7 * DAY) });
    const w = world([c]);
    // First run: the ledger write fails after the email was delivered.
    const r1 = await runSendWarnings(
      w.deps(T0, {
        recordSent: async () => {
          throw new Error("db down");
        },
      }),
    );
    expect(r1.failed).toBe(1);
    expect(w.mailer.sent).toHaveLength(1);
    // Next run: ledger is empty, so it tries again, but the provider collapses the same idempotency key.
    await runSendWarnings(w.deps(new Date(T0.getTime() + HOUR)));
    expect(w.mailer.sent).toHaveLength(1);
    expect(w.ledger.size).toBe(1);
  });
});

describe("runSendWarnings: who gets one", () => {
  it("skips someone who saved after the warning would have been due", async () => {
    const deadline = new Date(T0.getTime() + 7 * DAY);
    const late = cand({ deadline, saved_at: new Date(T0.getTime() + 0).toISOString() }); // saved right now, 7d before: ok within slack
    const tooLate = cand({ deadline, saved_at: new Date(T0.getTime() + 2 * HOUR).toISOString() }); // saved after the 7-day mark
    const w = world([late, tooLate]);
    const r = await runSendWarnings(w.deps(T0));
    expect(r).toMatchObject({ sent: 1, skippedSavedLate: 1 });
    expect(w.mailer.sent[0].to).toBe(late.email);
  });

  it("emails each saver of the same stage separately", async () => {
    const deadline = new Date(T0.getTime() + 7 * DAY);
    const a = cand({ deadline, stage_id: "shared", user_id: "ua" });
    const b = cand({ deadline, stage_id: "shared", user_id: "ub" });
    const w = world([a, b]);
    expect((await runSendWarnings(w.deps(T0))).sent).toBe(2);
    expect(new Set(w.mailer.sent.map((m) => m.to))).toEqual(new Set([a.email, b.email]));
  });
});

describe("runSendWarnings: content", () => {
  it("names the competition, stage, Central Time deadline, register link and carries one-click unsubscribe", async () => {
    const c = cand({ deadline: new Date("2026-11-17T05:59:00Z") }); // Nov 16 11:59 PM CST
    const w = world([c]);
    await runSendWarnings(w.deps(new Date("2026-11-10T05:59:00Z")));
    const m = w.mailer.sent[0];
    expect(m.text).toContain("AIS Fall Case Competition");
    expect(m.text).toContain("Registration closes: due Nov 16, 2026, 11:59 PM CT");
    expect(m.text).toContain("Register: https://example.com/r");
    expect(m.text).toContain("https://cometarena.example/game/ais-fall-case");
    expect(m.html).toContain(`unsubscribe?t=comp-${c.user_id}-${c.competition_id}`);
    expect(m.headers).toMatchObject({ "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });
});

describe("runSendWarnings: failures", () => {
  it("one failing recipient does not block the rest, and failures are not recorded as sent", async () => {
    const deadline = new Date(T0.getTime() + 7 * DAY);
    const bad = cand({ deadline, email: "bad@utdallas.edu" });
    const good = cand({ deadline });
    const w = world([bad, good], {
      failFor: (m) => (m.to === "bad@utdallas.edu" ? new SourceError("resend", "malformed") : null),
    });
    const r = await runSendWarnings(w.deps(T0));
    expect(r).toMatchObject({ sent: 1, failed: 1 });
    expect(r.errors[0]).toMatchObject({ user_id: bad.user_id, window: "d7" });
    expect(w.ledger.has(`d7:${bad.user_id}:${bad.stage_id}`)).toBe(false);
    expect(w.ledger.has(`d7:${good.user_id}:${good.stage_id}`)).toBe(true);
  });

  it("a failed send is delivered by a later hourly run (catch-up), and not after the grace period", async () => {
    const stage = cand({ deadline: new Date(T0.getTime() + 7 * DAY) });
    let failing = true;
    const w = world([stage], {
      failFor: () => (failing ? new SourceError("resend", "malformed") : null),
    });
    await runSendWarnings(w.deps(T0));
    expect(w.mailer.sent).toHaveLength(0);

    failing = false;
    await runSendWarnings(w.deps(new Date(T0.getTime() + 2 * HOUR))); // 2h later: still inside the catch-up grace
    expect(w.mailer.sent).toHaveLength(1);

    // A different stage whose window passed more than the grace ago is not sent late.
    const stale = cand({ deadline: new Date(T0.getTime() + 7 * DAY - CATCH_UP_MS - HOUR) });
    const w2 = world([stale]);
    expect((await runSendWarnings(w2.deps(T0))).sent).toBe(0);
  });

  it("retries rate limits and outages with backoff, honoring Retry-After", async () => {
    const stage = cand({ deadline: new Date(T0.getTime() + 7 * DAY) });
    let calls = 0;
    const w = world([stage], {
      failFor: () =>
        ++calls <= 2 ? new SourceError("resend", "rate_limit", undefined, 8000) : null,
    });
    const r = await runSendWarnings(w.deps(T0, { retryDelaysMs: [1000, 4000, 15000], paceMs: 0 }));
    expect(r.sent).toBe(1);
    expect(w.sleeps).toEqual([8000, 8000]); // Retry-After beats the shorter backoff
  });

  it("gives up after the retry budget and reports the error", async () => {
    const stage = cand({ deadline: new Date(T0.getTime() + 7 * DAY) });
    const w = world([stage], { failFor: () => new SourceError("resend", "unavailable") });
    const r = await runSendWarnings(w.deps(T0, { retryDelaysMs: [1, 2], paceMs: 0 }));
    expect(r).toMatchObject({ sent: 0, failed: 1 });
    expect(w.ledger.size).toBe(0);
  });

  it("does not retry permanent failures", async () => {
    const stage = cand({ deadline: new Date(T0.getTime() + 7 * DAY) });
    const attempts = vi.fn(() => new SourceError("resend", "malformed"));
    const w = world([stage], { failFor: attempts });
    await runSendWarnings(w.deps(T0, { paceMs: 0 }));
    expect(attempts).toHaveBeenCalledTimes(1);
  });

  it("paces sends to respect the provider rate limit", async () => {
    const deadline = new Date(T0.getTime() + 7 * DAY);
    const w = world([cand({ deadline }), cand({ deadline }), cand({ deadline })]);
    await runSendWarnings(w.deps(T0, { paceMs: 600 }));
    expect(w.sleeps).toEqual([600, 600]); // between sends, not before the first
  });

  it("propagates a database failure while finding candidates (the job must show as failed)", async () => {
    const w = world([]);
    await expect(
      runSendWarnings(
        w.deps(T0, {
          findCandidates: async () => {
            throw new Error("db down");
          },
        }),
      ),
    ).rejects.toThrow("db down");
  });
});
