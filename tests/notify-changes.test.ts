import { describe, expect, it } from "vitest";
import { toPendingChange } from "@/lib/jobs/changes-store";
import {
  type NotifyDeps,
  type PendingChange,
  type Saver,
  STALE_AFTER_MS,
  type StageSnapshot,
  diffStages,
  runNotifyChanges,
} from "@/lib/jobs/notify-changes";
import { SourceError } from "@/lib/sources";
import { createMockMailer } from "@/lib/sources/mock/mailer";

const NOW = new Date("2026-11-10T15:00:00Z");
const st = (name: string, deadline: string, starts: string | null = null): StageSnapshot => ({
  name,
  starts_at: starts,
  deadline_at: deadline,
});

describe("diffStages", () => {
  it("reports moved, added and removed stages (by name, case-insensitive) in date order", () => {
    const before = [
      st("Registration", "2026-11-20T05:59:00Z"),
      st("Finals", "2026-12-05T23:00:00Z"),
    ];
    const after = [
      st("registration", "2026-11-27T05:59:00Z"),
      st("Semifinals", "2026-12-01T23:00:00Z"),
    ];
    expect(diffStages(before, after)).toEqual(
      [
        { stageName: "Semifinals", before: null, after: "2026-12-01T23:00:00Z" },
        {
          stageName: "registration",
          before: "2026-11-20T05:59:00Z",
          after: "2026-11-27T05:59:00Z",
        },
        { stageName: "Finals", before: "2026-12-05T23:00:00Z", after: null },
      ].sort((a, b) => (a.after ?? a.before!).localeCompare(b.after ?? b.before!)),
    );
  });

  it("ignores identical deadlines, formatting differences and start-only changes", () => {
    expect(
      diffStages([st("R", "2026-11-20T05:59:00Z")], [st("R", "2026-11-20T05:59:00.000Z")]),
    ).toEqual([]);
    expect(
      diffStages(
        [st("R", "2026-11-20T05:59:00Z", null)],
        [st("R", "2026-11-20T05:59:00Z", "2026-11-19T10:00:00Z")],
      ),
    ).toEqual([]);
    expect(diffStages([], [])).toEqual([]);
  });
});

const change = (over: Partial<PendingChange> = {}): PendingChange => ({
  id: "ch1",
  competition_id: "comp1",
  created_at: new Date(NOW.getTime() - 3_600_000).toISOString(),
  title: "AIS Case",
  slug: "ais-case",
  before: [st("Registration", "2026-11-20T05:59:00Z")],
  after: [st("Registration", "2026-11-27T05:59:00Z")],
  ...over,
});
const savers: Saver[] = [
  { user_id: "ua", email: "a@utdallas.edu", name: "Ada Lovelace" },
  { user_id: "ub", email: "b@utdallas.edu", name: null },
];

function setup(
  changes: PendingChange[],
  over: Partial<NotifyDeps> = {},
  mailerOpts?: Parameters<typeof createMockMailer>[0],
) {
  const mailer = createMockMailer(mailerOpts);
  const notified: string[] = [];
  const deps: NotifyDeps = {
    loadPending: async () => changes,
    loadSavers: async () => savers,
    markNotified: async (id) => void notified.push(id),
    mailer,
    appUrl: "https://cometarena.example",
    unsubscribe: {
      competitionUrl: (u, c) => `https://cometarena.example/unsubscribe?t=${u}-${c}`,
      headers: (u) => ({ "List-Unsubscribe": `<x-${u}>` }),
    },
    now: NOW,
    sleep: async () => {},
    paceMs: 0,
    ...over,
  };
  return { deps, mailer, notified };
}

describe("runNotifyChanges", () => {
  it("emails every saver once with old → new, then marks the change notified", async () => {
    const { deps, mailer, notified } = setup([change()]);
    const r = await runNotifyChanges(deps);
    expect(r).toMatchObject({ changes: 1, emails: 2, failed: 0 });
    expect(notified).toEqual(["ch1"]);
    const m = mailer.sent[0];
    expect(m.subject).toBe("Dates changed: AIS Case");
    expect(m.text).toContain(
      "Registration: Nov 19, 2026, 11:59 PM CT -> Nov 26, 2026, 11:59 PM CT",
    );
    expect(m.html).toContain("unsubscribe?t=ua-comp1");
    expect(m.idempotencyKey).toBe("change:ch1:ua");
  });

  it("a second run after success sends nothing (the change is no longer pending)", async () => {
    const pending = [change()];
    const done: string[] = [];
    const { deps, mailer } = setup(pending, {
      loadPending: async () => pending.filter((c) => !done.includes(c.id)),
      markNotified: async (id) => void done.push(id),
    });
    await runNotifyChanges(deps);
    await runNotifyChanges(deps);
    expect(mailer.sent).toHaveLength(2); // two savers, once each
  });

  it("leaves the change pending when anyone fails, and a retry emails only the failed person (idempotency)", async () => {
    let failB = true;
    const mailer = createMockMailer({
      failFor: (m) =>
        failB && m.to === "b@utdallas.edu" ? new SourceError("resend", "malformed") : null,
    });
    const notified: string[] = [];
    const deps: NotifyDeps = {
      ...setup([change()]).deps,
      mailer,
      markNotified: async (id) => void notified.push(id),
    };
    const r1 = await runNotifyChanges(deps);
    expect(r1).toMatchObject({ emails: 1, failed: 1 });
    expect(notified).toEqual([]);
    failB = false;
    await runNotifyChanges(deps);
    expect(mailer.sent.map((m) => m.to)).toEqual(["a@utdallas.edu", "b@utdallas.edu"]); // A not emailed twice
    expect(notified).toEqual(["ch1"]);
  });

  it("retires stale changes without emailing", async () => {
    const old = change({
      created_at: new Date(NOW.getTime() - STALE_AFTER_MS - 1000).toISOString(),
    });
    const { deps, mailer, notified } = setup([old]);
    expect(await runNotifyChanges(deps)).toMatchObject({ retiredStale: 1, emails: 0 });
    expect(notified).toEqual(["ch1"]);
    expect(mailer.sent).toHaveLength(0);
  });

  it("closes out a change with no real difference without emailing", async () => {
    const same = change({ after: change().before });
    const { deps, mailer, notified } = setup([same]);
    expect(await runNotifyChanges(deps)).toMatchObject({ skippedNoChange: 1, emails: 0 });
    expect(notified).toEqual(["ch1"]);
    expect(mailer.sent).toHaveLength(0);
  });

  it("handles a competition nobody saved (marks it done, sends nothing)", async () => {
    const { deps, mailer, notified } = setup([change()], { loadSavers: async () => [] });
    expect(await runNotifyChanges(deps)).toMatchObject({ emails: 0, failed: 0 });
    expect(notified).toEqual(["ch1"]);
    expect(mailer.sent).toHaveLength(0);
  });

  it("describes added and removed stages in the same email", async () => {
    const { deps, mailer } = setup(
      [
        change({
          before: [st("Finals", "2026-12-05T23:00:00Z")],
          after: [st("Semifinals", "2026-12-01T23:00:00Z")],
        }),
      ],
      { loadSavers: async () => [savers[0]] },
    );
    await runNotifyChanges(deps);
    expect(mailer.sent[0].text).toContain("Finals: Dec 5, 2026, 5:00 PM CT -> removed");
    expect(mailer.sent[0].text).toContain("Semifinals: new -> Dec 1, 2026, 5:00 PM CT");
  });
});

describe("toPendingChange", () => {
  it("maps rows, tolerating array relations and missing summaries, and drops rows without a competition", () => {
    const row = {
      id: "c",
      competition_id: "k",
      created_at: "2026-11-10T00:00:00Z",
      summary: { before: [st("R", "2026-11-20T00:00:00Z")], after: [] },
      competition: [{ title: "T", slug: "t" }],
    };
    expect(toPendingChange(row)).toMatchObject({
      title: "T",
      slug: "t",
      before: [{ name: "R" }],
      after: [],
    });
    expect(
      toPendingChange({ ...row, summary: null, competition: { title: "T", slug: "t" } }),
    ).toMatchObject({ before: [], after: [] });
    expect(toPendingChange({ ...row, competition: null })).toBeNull();
  });
});
