/** What we can learn from a web page without a DOM library: Open Graph tags, title and visible text. */
export interface PageInfo {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  text: string;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

/** Value of <meta property|name="key" content="..."> in either attribute order. */
function meta(html: string, key: string): string | null {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = new RegExp(
    `<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`,
    "i",
  ).exec(html);
  const b = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`,
    "i",
  ).exec(html);
  const v = (a ?? b)?.[1];
  return v ? decodeEntities(v).trim() || null : null;
}

export const MAX_TEXT_CHARS = 4000;

/** Plain visible text: scripts, styles and tags removed, whitespace collapsed, capped. */
export function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

export function parsePage(html: string, baseUrl: string): PageInfo {
  const title =
    meta(html, "og:title") ??
    decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim() ??
    null;
  const description =
    meta(html, "og:description") ?? meta(html, "description") ?? meta(html, "twitter:description");
  const rawImage = meta(html, "og:image") ?? meta(html, "twitter:image");
  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      imageUrl = new URL(rawImage, baseUrl).toString();
    } catch {
      imageUrl = null;
    }
  }
  return { title: title || null, description, imageUrl, text: visibleText(html) };
}

/** Caption-like text for the extractor: the page's own description first, then headline and body text. */
export function captionFromPage(p: PageInfo): string {
  return [p.title, p.description, p.description ? "" : p.text.slice(0, 1500)]
    .filter((x) => x && x.trim())
    .join("\n")
    .slice(0, MAX_TEXT_CHARS);
}
