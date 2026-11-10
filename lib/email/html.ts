import { safeExternalUrl } from "@/lib/format";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Attribute-safe URL: http(s) only, then HTML-escaped. Returns null for anything else. */
export function safeHref(url: string | null | undefined): string | null {
  const safe = safeExternalUrl(url);
  return safe ? escapeHtml(safe) : null;
}

const TURF = "#10372a";
const ORANGE = "#e87500";

export function button(label: string, href: string | null): string {
  const h = safeHref(href);
  if (!h) return "";
  return `<a href="${h}" style="display:inline-block;background:${ORANGE};color:#1b1a17;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:16px">${escapeHtml(label)}</a>`;
}

/** Shared email shell: branded header, body, footer with unsubscribe links. */
export function layout(args: { preheader: string; bodyHtml: string; footerHtml: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comet Arena</title></head>
<body style="margin:0;background:#efe3cf;font-family:Arial,Helvetica,sans-serif;color:#1b1a17">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(args.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe3cf"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#f6f1e7;border-radius:12px;overflow:hidden">
<tr><td style="background:${TURF};padding:16px 24px;font-size:22px;font-weight:800;letter-spacing:1px;color:#f6f1e7">COMET <span style="color:${ORANGE}">ARENA</span></td></tr>
<tr><td style="padding:24px">${args.bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;background:#e9dfcc;font-size:12px;color:#5a554b;line-height:1.5">${args.footerHtml}</td></tr>
</table></td></tr></table></body></html>`;
}
