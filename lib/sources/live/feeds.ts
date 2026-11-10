import { SourceError } from "../errors";
import type { FeedListing, FeedSource } from "../types";

const DFW =
  /\b(dallas|richardson|plano|fort worth|dfw|frisco|irving|arlington|denton|addison|texas|, tx\b|utd|ut dallas)\b/i;
const VIRTUAL = /\b(online|virtual|remote|worldwide|global)\b/i;

/** DFW or virtual only: the spec's scope for external hackathons. */
export const isDfwOrVirtual = (text: string) => DFW.test(text) || VIRTUAL.test(text);

const strip = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export interface FeedOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxPages?: number;
  fetchImpl?: typeof fetch;
}

async function get(source: string, url: string, o: FeedOptions, accept: string): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 15000);
  try {
    const res = await (o.fetchImpl ?? fetch)(url, {
      headers: { accept, "user-agent": "CometArenaBot/1.0" },
      signal: ctl.signal,
    });
    if (res.status === 429) throw new SourceError(source, "rate_limit", "rate limited", 60_000);
    if (!res.ok) throw new SourceError(source, "unavailable", `HTTP ${res.status}`);
    return res;
  } catch (e) {
    if (e instanceof SourceError) throw e;
    throw new SourceError(
      source,
      (e as Error).name === "AbortError" ? "timeout" : "unavailable",
      "request failed",
    );
  } finally {
    clearTimeout(timer);
  }
}

interface DevpostHackathon {
  id?: number | string;
  title?: string;
  url?: string;
  displayed_location?: { location?: string };
  submission_period_dates?: string;
  themes?: { name?: string }[];
  prize_amount?: string;
  organization_name?: string;
  open_state?: string;
}

/** Devpost public JSON listing (in-person + online, upcoming/open). Endpoint shape is unverified against production. */
export function createDevpost(o: FeedOptions = {}): FeedSource {
  const base = (o.baseUrl ?? "https://devpost.com").replace(/\/$/, "");
  return {
    async fetchListings() {
      const out: FeedListing[] = [];
      for (let page = 1; page <= (o.maxPages ?? 3); page++) {
        const url = `${base}/api/hackathons?status[]=upcoming&status[]=open&order_by=deadline&page=${page}`;
        const body = (await (await get("devpost", url, o, "application/json")).json().catch(() => {
          throw new SourceError("devpost", "malformed", "invalid JSON");
        })) as { hackathons?: DevpostHackathon[] };
        if (!Array.isArray(body.hackathons))
          throw new SourceError("devpost", "malformed", "no hackathons array");
        if (body.hackathons.length === 0) break;
        for (const h of body.hackathons) {
          if (!h.id || !h.title || !h.url) continue;
          const location = h.displayed_location?.location ?? "";
          const text = [
            `${h.title}.`,
            location && `Location: ${location}.`,
            h.submission_period_dates && `Dates: ${h.submission_period_dates}.`,
            h.prize_amount && `Prizes: ${strip(h.prize_amount)}.`,
            h.organization_name && `Hosted by ${h.organization_name}.`,
            h.themes?.length &&
              `Themes: ${h.themes
                .map((t) => t.name)
                .filter(Boolean)
                .join(", ")}.`,
          ]
            .filter(Boolean)
            .join(" ");
          if (!isDfwOrVirtual(`${location} ${text}`)) continue;
          out.push({
            source: "devpost",
            externalId: String(h.id),
            url: h.url,
            title: h.title,
            text,
            postedAt: new Date().toISOString(),
          });
        }
      }
      return out;
    },
  };
}

/** MLH season page. Parses schema.org Event microdata; unverified against production markup. */
export function parseMlhEvents(html: string): FeedListing[] {
  const blocks = html.split(/itemtype=["']http:\/\/schema\.org\/Event["']/i).slice(1);
  const prop = (b: string, name: string) => {
    const m = b.match(
      new RegExp(`itemprop=["']${name}["'][^>]*?(?:content=["']([^"']*)["']|>([\\s\\S]*?)<)`, "i"),
    );
    return m ? strip(m[1] ?? m[2] ?? "") : "";
  };
  const out: FeedListing[] = [];
  for (const b of blocks) {
    const name = prop(b, "name");
    const url = b.match(/<a[^>]*href=["']([^"']+)["']/i)?.[1] ?? prop(b, "url");
    if (!name || !url) continue;
    const city = prop(b, "city");
    const state = prop(b, "state");
    const start = prop(b, "startDate");
    const end = prop(b, "endDate");
    const digital = /digital|online/i.test(b);
    const where = digital ? "Online" : [city, state].filter(Boolean).join(", ");
    out.push({
      source: "mlh",
      externalId: url
        .replace(/^https?:\/\//, "")
        .replace(/[?#].*$/, "")
        .replace(/\/$/, ""),
      url,
      title: name,
      text: `${name}. Location: ${where}. Dates: ${start}${end ? ` to ${end}` : ""}.`,
      postedAt: new Date().toISOString(),
    });
  }
  return out;
}

export function createMlh(o: FeedOptions = {}): FeedSource {
  const url = o.baseUrl ?? `https://mlh.io/seasons/${new Date().getFullYear() + 1}/events`;
  return {
    async fetchListings() {
      const html = await (await get("mlh", url, o, "text/html")).text();
      const all = parseMlhEvents(html);
      // A page with markup but zero parsable events means the layout changed: fail loudly, never silently empty.
      if (all.length === 0 && /<html/i.test(html))
        throw new SourceError("mlh", "malformed", "no events parsed; page layout may have changed");
      return all.filter((l) => isDfwOrVirtual(l.text));
    },
  };
}
