import { formatCT } from "@/lib/time";
import { safeExternalUrl } from "@/lib/format";
import { button, escapeHtml, layout, safeHref } from "./html";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const WINDOW_LABEL = { d7: "7 days", d1: "1 day" } as const;

export interface WarningInput {
  userName?: string | null;
  competitionTitle: string;
  stageName: string;
  deadlineAt: string;
  window: keyof typeof WINDOW_LABEL;
  registerUrl: string | null;
  gameUrl: string;
  /** One-click unsubscribe from this competition's warnings, and from all warnings. */
  unsubscribeCompetitionUrl: string;
  unsubscribeAllUrl: string;
}

const hello = (name?: string | null) => (name?.trim() ? `Hi ${name.trim().split(" ")[0]},` : "Hi,");

/** Two-Minute Warning: names the competition, stage, deadline in Central Time and the register link. */
export function warningEmail(i: WarningInput): RenderedEmail {
  const when = formatCT(i.deadlineAt);
  const label = WINDOW_LABEL[i.window];
  const subject = `${label} left: ${i.competitionTitle}, ${i.stageName}`;

  const html = layout({
    preheader: `${i.stageName} is due ${when}`,
    bodyHtml: `
<p style="margin:0 0 12px">${escapeHtml(hello(i.userName))}</p>
<p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:1px;color:#7a4e00">${escapeHtml(label.toUpperCase())} LEFT</p>
<h1 style="margin:0 0 8px;font-size:26px;line-height:1.2">${escapeHtml(i.competitionTitle)}</h1>
<p style="margin:0 0 4px;font-size:18px"><strong>${escapeHtml(i.stageName)}</strong></p>
<p style="margin:0 0 20px;font-size:18px">Due <strong>${escapeHtml(when)}</strong></p>
<p style="margin:0 0 12px">${button("Register now", i.registerUrl)}</p>
<p style="margin:0"><a href="${safeHref(i.gameUrl) ?? "#"}" style="color:#10372a">See all rounds and details</a></p>`,
    footerHtml: `You saved this competition on Comet Arena.<br>
<a href="${safeHref(i.unsubscribeCompetitionUrl) ?? "#"}" style="color:#5a554b">Stop warnings for this competition</a> ·
<a href="${safeHref(i.unsubscribeAllUrl) ?? "#"}" style="color:#5a554b">Stop all warnings</a>`,
  });

  const text = [
    hello(i.userName),
    "",
    `${label.toUpperCase()} LEFT`,
    i.competitionTitle,
    `${i.stageName}: due ${when}`,
    "",
    safeExternalUrl(i.registerUrl)
      ? `Register: ${safeExternalUrl(i.registerUrl)}`
      : "Registration link not announced yet.",
    `Details: ${i.gameUrl}`,
    "",
    "You saved this competition on Comet Arena.",
    `Stop warnings for this competition: ${i.unsubscribeCompetitionUrl}`,
    `Stop all warnings: ${i.unsubscribeAllUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export interface DigestItem {
  title: string;
  slug: string;
  host: string | null;
  /** Next deadline (ISO) and the stage it belongs to. */
  stageName: string | null;
  deadlineAt: string | null;
  saved?: boolean;
}

export interface DigestInput {
  userName?: string | null;
  closingThisWeek: DigestItem[];
  newThisWeek: DigestItem[];
  appUrl: string;
  unsubscribeUrl: string;
  /** Subscribers without an account get the unranked version and an invitation to sign in. */
  personalized: boolean;
}

function digestSection(
  title: string,
  items: DigestItem[],
  appUrl: string,
): { html: string; text: string } {
  if (items.length === 0) return { html: "", text: "" };
  const base = appUrl.replace(/\/+$/, "");
  const rows = items
    .map((it) => {
      const url = `${base}/game/${it.slug}`;
      const due =
        it.deadlineAt && it.stageName
          ? `${it.stageName}: ${formatCT(it.deadlineAt, "weekday")}, ${formatCT(it.deadlineAt, "time")}`
          : "Dates coming soon";
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #d9c8a9">
<a href="${safeHref(url) ?? "#"}" style="font-weight:700;color:#10372a;text-decoration:none;font-size:16px">${it.saved ? "★ " : ""}${escapeHtml(it.title)}</a><br>
<span style="font-size:13px;color:#5a554b">${escapeHtml([it.host, due].filter(Boolean).join(" · "))}</span></td></tr>`;
    })
    .join("");
  const html = `<h2 style="margin:20px 0 4px;font-size:20px">${escapeHtml(title)}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
  const text = [
    `${title.toUpperCase()}`,
    ...items.map(
      (it) =>
        `- ${it.saved ? "[saved] " : ""}${it.title}${it.deadlineAt && it.stageName ? ` (${it.stageName}: ${formatCT(it.deadlineAt)})` : ""}\n  ${base}/game/${it.slug}`,
    ),
    "",
  ].join("\n");
  return { html, text };
}

/** Comet Arena Weekly: "Closing this week" (saved first) and "New this week". */
export function digestEmail(i: DigestInput): RenderedEmail {
  const closing = digestSection("Closing this week", i.closingThisWeek, i.appUrl);
  const fresh = digestSection("New this week", i.newThisWeek, i.appUrl);
  const subject =
    i.closingThisWeek.length > 0
      ? `${i.closingThisWeek.length} UTD competition${i.closingThisWeek.length === 1 ? "" : "s"} closing this week`
      : `New UTD competitions this week`;

  const html = layout({
    preheader: subject,
    bodyHtml: `<p style="margin:0 0 4px">${escapeHtml(hello(i.userName))}</p>
<h1 style="margin:0;font-size:26px">Your week in the Arena</h1>${closing.html}${fresh.html}
<p style="margin:24px 0 0">${button(i.personalized ? "Open your Scouting Report" : "Sign in to save and get warnings", `${i.appUrl.replace(/\/+$/, "")}/${i.personalized ? "" : "login"}`)}</p>`,
    footerHtml: `You get this on Sundays at 6 PM Central. <a href="${safeHref(i.unsubscribeUrl) ?? "#"}" style="color:#5a554b">Unsubscribe</a>`,
  });
  const text = [
    hello(i.userName),
    "",
    "YOUR WEEK IN THE ARENA",
    "",
    closing.text,
    fresh.text,
    `Unsubscribe: ${i.unsubscribeUrl}`,
  ].join("\n");
  return { subject, html, text };
}

export interface ChangeInput {
  userName?: string | null;
  competitionTitle: string;
  gameUrl: string;
  changes: { stageName: string; before: string | null; after: string | null }[];
  unsubscribeCompetitionUrl: string;
}

/** "Dates changed for X": old to new for every changed stage. */
export function changeEmail(i: ChangeInput): RenderedEmail {
  const fmt = (iso: string | null) => (iso ? formatCT(iso) : "removed");
  const subject = `Dates changed: ${i.competitionTitle}`;
  const rows = i.changes
    .map(
      (c) =>
        `<tr><td style="padding:6px 0"><strong>${escapeHtml(c.stageName)}</strong><br><span style="color:#5a554b;text-decoration:line-through">${escapeHtml(fmt(c.before))}</span> &rarr; <strong>${escapeHtml(fmt(c.after))}</strong></td></tr>`,
    )
    .join("");
  const html = layout({
    preheader: subject,
    bodyHtml: `<p style="margin:0 0 12px">${escapeHtml(hello(i.userName))}</p>
<h1 style="margin:0 0 8px;font-size:24px">${escapeHtml(i.competitionTitle)}</h1>
<p style="margin:0 0 12px">The host changed the schedule:</p>
<table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>
<p style="margin:20px 0 0">${button("See the new schedule", i.gameUrl)}</p>`,
    footerHtml: `You saved this competition on Comet Arena. <a href="${safeHref(i.unsubscribeCompetitionUrl) ?? "#"}" style="color:#5a554b">Stop updates for this competition</a>`,
  });
  const text = [
    hello(i.userName),
    "",
    `${i.competitionTitle}: the host changed the schedule.`,
    ...i.changes.map((c) => `- ${c.stageName}: ${fmt(c.before)} -> ${fmt(c.after)}`),
    "",
    `Details: ${i.gameUrl}`,
    `Stop updates: ${i.unsubscribeCompetitionUrl}`,
  ].join("\n");
  return { subject, html, text };
}
