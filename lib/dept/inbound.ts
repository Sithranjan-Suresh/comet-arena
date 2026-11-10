import { z } from "zod";

export interface InboundMessage {
  from: string;
  subject: string;
  body: string;
  messageId: string;
}

const str = z.string().max(2_000_000);
/** Field names differ by provider (Postmark, Resend, SendGrid, Mailgun); accept the common spellings. */
const rawSchema = z
  .object({
    from: str.optional(),
    From: str.optional(),
    sender: str.optional(),
    subject: str.optional(),
    Subject: str.optional(),
    text: str.optional(),
    TextBody: str.optional(),
    "body-plain": str.optional(),
    html: str.optional(),
    HtmlBody: str.optional(),
    "body-html": str.optional(),
    messageId: str.optional(),
    message_id: str.optional(),
    MessageID: str.optional(),
    "Message-Id": str.optional(),
  })
  .passthrough();

/** "Name <a@b.edu>" -> "a@b.edu", lowercased. */
export function senderAddress(from: string): string | null {
  const m = /<([^>]+)>/.exec(from) ?? /([^\s<>]+@[^\s<>]+)/.exec(from);
  const a = m?.[1]?.trim().toLowerCase();
  return a && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a) ? a : null;
}

/** Allowed when the sender's address or its domain (or a parent domain) is on the list. */
export function senderAllowed(from: string, allow: string[]): boolean {
  const addr = senderAddress(from);
  if (!addr) return false;
  const domain = addr.split("@")[1];
  return allow.some((a) => {
    const x = a.trim().toLowerCase();
    return x === addr || domain === x || domain.endsWith(`.${x}`);
  });
}

/** Drop quoted replies, signatures, and unsubscribe footers so they are never mistaken for announcements. */
export function cleanEmailBody(text: string): string {
  const out: string[] = [];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (/^\s*>/.test(line)) continue; // quoted reply
    if (/^--\s*$/.test(line)) break; // signature delimiter
    if (/^\s*(unsubscribe|manage (your )?preferences|view in browser|sent from my)/i.test(line))
      continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

const htmlToText = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ");

/** Normalize a provider's webhook payload, or null if it has no sender, no body or no usable id. */
export function parseInbound(payload: unknown): InboundMessage | null {
  const r = rawSchema.safeParse(payload);
  if (!r.success) return null;
  const p = r.data;
  const from = p.from ?? p.From ?? p.sender ?? "";
  const subject = (p.subject ?? p.Subject ?? "").trim();
  const text = p.text ?? p.TextBody ?? p["body-plain"];
  const html = p.html ?? p.HtmlBody ?? p["body-html"];
  const body = cleanEmailBody(text ?? (html ? htmlToText(html) : ""));
  const messageId = (p.messageId ?? p.message_id ?? p.MessageID ?? p["Message-Id"] ?? "").trim();
  if (!from || !body || !messageId) return null;
  return { from, subject: subject.slice(0, 300), body, messageId: messageId.slice(0, 300) };
}
