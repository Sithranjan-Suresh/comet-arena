import { describe, expect, it, vi } from "vitest";
import { escapeHtml, safeHref } from "@/lib/email/html";
import { changeEmail, digestEmail, warningEmail } from "@/lib/email/templates";
import { createResendMailer } from "@/lib/sources/live/resend";
import { createMockMailer } from "@/lib/sources/mock/mailer";
import { SourceError } from "@/lib/sources";

const base = {
  userName: "Ada Lovelace",
  competitionTitle: "AIS Fall Case Competition",
  stageName: "Registration closes",
  deadlineAt: "2026-11-21T05:59:00Z", // Nov 20 11:59 PM CT
  window: "d7" as const,
  registerUrl: "https://example.com/r?a=1&b=2",
  gameUrl: "https://cometarena.example/game/ais-fall-case",
  unsubscribeCompetitionUrl: "https://cometarena.example/unsubscribe?t=comp",
  unsubscribeAllUrl: "https://cometarena.example/unsubscribe?t=all",
};

describe("html helpers", () => {
  it("escapes all HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x")&'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;y&#39;&lt;/script&gt;",
    );
  });
  it("only allows http(s) hrefs and escapes them", () => {
    expect(safeHref("https://x.example/a?b=1&c=2")).toBe("https://x.example/a?b=1&amp;c=2");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "", null, undefined])
      expect(safeHref(bad as string)).toBeNull();
  });
});

describe("warningEmail", () => {
  it("names the competition, stage, Central Time deadline and register link in subject, HTML and text", () => {
    const e = warningEmail(base);
    expect(e.subject).toBe("7 days left: AIS Fall Case Competition, Registration closes");
    for (const part of [
      "AIS Fall Case Competition",
      "Registration closes",
      "Nov 20, 2026, 11:59 PM CT",
    ]) {
      expect(e.html).toContain(part);
      expect(e.text).toContain(part);
    }
    expect(e.html).toContain('href="https://example.com/r?a=1&amp;b=2"');
    expect(e.text).toContain("Register: https://example.com/r?a=1&b=2");
    expect(e.text).toContain("Hi Ada,");
  });

  it("uses 1 day wording and offers one-click unsubscribe for the competition and for everything", () => {
    const e = warningEmail({ ...base, window: "d1" });
    expect(e.subject.startsWith("1 day left:")).toBe(true);
    expect(e.html).toContain("https://cometarena.example/unsubscribe?t=comp");
    expect(e.html).toContain("https://cometarena.example/unsubscribe?t=all");
    expect(e.text).toContain("Stop all warnings: https://cometarena.example/unsubscribe?t=all");
  });

  it("cannot be hijacked by a hostile competition title or stage name (scraped data)", () => {
    const e = warningEmail({
      ...base,
      competitionTitle: '"><script>alert(1)</script>',
      stageName: "<img src=x onerror=alert(1)>",
    });
    expect(e.html).not.toContain("<script>");
    expect(e.html).not.toContain("<img src=x");
    expect(e.html).toContain("&lt;script&gt;");
  });

  it("drops the register button for missing or unsafe links but keeps the email useful", () => {
    for (const url of [null, "javascript:alert(1)"]) {
      const e = warningEmail({ ...base, registerUrl: url });
      expect(e.html).not.toContain("Register now");
      expect(e.html).not.toContain("javascript:");
      expect(e.text).toContain("Registration link not announced yet.");
    }
  });

  it("greets generically when there is no name", () => {
    expect(warningEmail({ ...base, userName: null }).text.startsWith("Hi,")).toBe(true);
  });
});

describe("digestEmail", () => {
  const item = (title: string, saved = false) => ({
    title,
    slug: title.toLowerCase().replace(/\W+/g, "-"),
    host: "AIS",
    stageName: "Finals",
    deadlineAt: "2026-12-05T23:00:00Z",
    saved,
  });
  const input = {
    userName: "Ada",
    closingThisWeek: [item("Saved One", true), item("Other")],
    newThisWeek: [item("Brand New")],
    appUrl: "https://cometarena.example/",
    unsubscribeUrl: "https://cometarena.example/unsubscribe?t=x",
    personalized: true,
  };

  it("has both sections, marks saved items and links to Game Day pages", () => {
    const e = digestEmail(input);
    expect(e.subject).toBe("2 UTD competitions closing this week");
    expect(e.html).toContain("Closing this week");
    expect(e.html).toContain("New this week");
    expect(e.html).toContain("★ Saved One");
    expect(e.html).toContain('href="https://cometarena.example/game/brand-new"');
    expect(e.text).toContain("[saved] Saved One");
  });

  it("omits empty sections, handles singular, and falls back to a 'new' subject", () => {
    expect(digestEmail({ ...input, closingThisWeek: [item("Only")] }).subject).toBe(
      "1 UTD competition closing this week",
    );
    const onlyNew = digestEmail({ ...input, closingThisWeek: [] });
    expect(onlyNew.subject).toBe("New UTD competitions this week");
    expect(onlyNew.html).not.toContain("Closing this week");
  });

  it("subscribers without an account are invited to sign in; account holders to their report", () => {
    expect(digestEmail({ ...input, personalized: false }).html).toContain(
      "Sign in to save and get warnings",
    );
    expect(digestEmail(input).html).toContain("Open your Scouting Report");
  });

  it("escapes titles and shows 'Dates coming soon' for undated items", () => {
    const e = digestEmail({
      ...input,
      closingThisWeek: [{ ...item("<b>x</b>"), deadlineAt: null, stageName: null }],
    });
    expect(e.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(e.html).toContain("Dates coming soon");
  });
});

describe("changeEmail", () => {
  it("shows old to new for each changed stage, including removed ones", () => {
    const e = changeEmail({
      userName: "Ada",
      competitionTitle: "Case Comp",
      gameUrl: "https://cometarena.example/game/c",
      unsubscribeCompetitionUrl: "https://cometarena.example/u",
      changes: [
        {
          stageName: "Registration",
          before: "2026-11-20T05:59:00Z",
          after: "2026-11-27T05:59:00Z",
        },
        { stageName: "Finals", before: "2026-12-05T23:00:00Z", after: null },
      ],
    });
    expect(e.subject).toBe("Dates changed: Case Comp");
    expect(e.text).toContain(
      "Registration: Nov 19, 2026, 11:59 PM CT -> Nov 26, 2026, 11:59 PM CT",
    );
    expect(e.text).toContain("Finals: Dec 5, 2026, 5:00 PM CT -> removed");
  });
});

describe("mock mailer", () => {
  const msg = { to: "a@utdallas.edu", subject: "s", html: "h", text: "t" };
  it("delivers a keyed message once and returns the same id on retries", async () => {
    const m = createMockMailer();
    const a = await m.send({ ...msg, idempotencyKey: "u1:s1:d7" });
    const b = await m.send({ ...msg, idempotencyKey: "u1:s1:d7" });
    const c = await m.send({ ...msg, idempotencyKey: "u1:s1:d1" });
    expect(b.id).toBe(a.id);
    expect(c.id).not.toBe(a.id);
    expect(m.sent).toHaveLength(2);
  });
  it("sends unkeyed messages every time and can simulate failures", async () => {
    const m = createMockMailer({
      failFor: (x) => (x.to === "bad@x" ? new SourceError("resend", "unavailable") : null),
    });
    await m.send(msg);
    await m.send(msg);
    expect(m.sent).toHaveLength(2);
    await expect(m.send({ ...msg, to: "bad@x" })).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("Resend mailer", () => {
  const ok = (id: unknown = "re_1") =>
    ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ id }) }) as Response;
  const fail = (status: number, h: Record<string, string> = {}) =>
    ({ ok: false, status, headers: new Headers(h), json: async () => ({}) }) as Response;
  const mail = (fetchImpl: typeof fetch) =>
    createResendMailer({ apiKey: "k", from: "Comet Arena <a@mail.example>", fetchImpl });
  const msg = {
    to: "a@utdallas.edu",
    subject: "s",
    html: "<p>h</p>",
    text: "t",
    idempotencyKey: "u:s:d7",
    headers: { "List-Unsubscribe": "<https://x>" },
  };

  it("posts the message with the idempotency key and returns the id", async () => {
    const fetchImpl = vi.fn(async () => ok("re_42"));
    expect(await mail(fetchImpl).send(msg)).toEqual({ id: "re_42" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const h = init.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer k");
    expect(h["idempotency-key"]).toBe("u:s:d7");
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: "Comet Arena <a@mail.example>",
      to: ["a@utdallas.edu"],
      headers: { "List-Unsubscribe": "<https://x>" },
    });
  });

  it("maps failures to typed errors", async () => {
    await expect(
      mail(vi.fn(async () => fail(429, { "retry-after": "3" }))).send(msg),
    ).rejects.toMatchObject({ kind: "rate_limit", retryAfterMs: 3000 });
    await expect(mail(vi.fn(async () => fail(422))).send(msg)).rejects.toMatchObject({
      kind: "malformed",
    });
    await expect(mail(vi.fn(async () => fail(500))).send(msg)).rejects.toMatchObject({
      kind: "unavailable",
    });
    await expect(
      mail(vi.fn(async () => Promise.reject(new Error("down")))).send(msg),
    ).rejects.toMatchObject({ kind: "unavailable" });
    await expect(mail(vi.fn(async () => ok(null))).send(msg)).rejects.toMatchObject({
      kind: "malformed",
    });
  });
});
