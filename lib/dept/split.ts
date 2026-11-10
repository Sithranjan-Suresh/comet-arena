import { createHash } from "node:crypto";

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");

/** Visible text of an HTML fragment, uncapped (department pages can be long; we split before capping per item). */
export function textOf(html: string): string {
  return decode(
    html
      .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>|<\/(p|h[1-6]|div|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const COMPETITIVE =
  /\b(hackathon|datathon|\w+thon|competition|contest|tournament|challenge|showdown|olympiad|case comp|pitch|invitational|prizes?|compete|register)\b/i;
export const looksCompetitive = (text: string) => COMPETITIVE.test(text);

const MIN_ITEM = 40;
const MAX_ITEM = 1800;

/**
 * Split an announcements page into candidate items: each <article>, or else each <li>, or else each
 * paragraph-sized block of text. Only items that mention something competitive are kept, so the model is
 * never asked about parking notices.
 */
export function splitAnnouncements(html: string): string[] {
  const blocks = (re: RegExp) => [...html.matchAll(re)].map((m) => textOf(m[1]));
  let items = blocks(/<article\b[^>]*>([\s\S]*?)<\/article>/gi);
  if (items.length === 0) items = blocks(/<li\b[^>]*>([\s\S]*?)<\/li>/gi);
  if (items.length === 0) items = textOf(html).split(/\n+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = raw.replace(/\s+/g, " ").trim().slice(0, MAX_ITEM);
    if (t.length < MIN_ITEM || !looksCompetitive(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Same blocks for plain-text email bodies: paragraphs separated by blank lines. */
export function splitParagraphs(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of text.split(/\n\s*\n/)) {
    const t = p.replace(/\s+/g, " ").trim().slice(0, MAX_ITEM);
    if (t.length < MIN_ITEM || !looksCompetitive(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export const shortHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
export const pageHash = (text: string) => createHash("sha256").update(text).digest("hex");
