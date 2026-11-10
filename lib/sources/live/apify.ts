import { SourceError } from "../errors";
import type { IgPost } from "../types";

/** Monthly Apify credits are spent. Callers should alert the admin and skip personal accounts until it resets. */
export class ApifyCreditsExhausted extends SourceError {
  constructor(message = "Apify monthly credits exhausted") {
    super("apify", "rate_limit", message, 24 * 3_600_000);
    this.name = "ApifyCreditsExhausted";
  }
}

export interface ApifyOptions {
  token: string;
  actor?: string;
  /** Abort the whole batch after this long (spec: 5 minutes). */
  timeoutMs?: number;
  resultsPerProfile?: number;
  fetchImpl?: typeof fetch;
}

/** Posts per handle (lowercased); a handle missing from the map had no data (private/missing). */
export interface PersonalAccountFetcher {
  fetchBatch(handles: string[]): Promise<Map<string, IgPost[]>>;
}

interface Item {
  id?: string;
  shortCode?: string;
  ownerUsername?: string;
  caption?: string;
  url?: string;
  displayUrl?: string;
  images?: string[];
  timestamp?: string;
  type?: string;
  error?: string;
}

export function itemToPost(it: Item): IgPost | null {
  const id = it.id ?? it.shortCode;
  const permalink =
    it.url ?? (it.shortCode ? `https://www.instagram.com/p/${it.shortCode}/` : null);
  if (!id || !permalink || !it.timestamp || Number.isNaN(Date.parse(it.timestamp))) return null;
  const urls = [it.displayUrl, ...(it.images ?? [])].filter(
    (u): u is string => typeof u === "string" && !!u,
  );
  const type = it.type === "Video" ? "VIDEO" : it.type === "Sidecar" ? "CAROUSEL_ALBUM" : "IMAGE";
  return {
    id,
    caption: it.caption ?? null,
    permalink,
    postedAt: new Date(it.timestamp).toISOString(),
    mediaType: type,
    mediaUrls: [...new Set(urls)],
  };
}

export function createApify(opts: ApifyOptions): PersonalAccountFetcher {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  const actor = opts.actor ?? "apify~instagram-scraper";
  const name = "apify";

  return {
    async fetchBatch(handles) {
      const out = new Map<string, IgPost[]>();
      if (handles.length === 0) return out;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      let res: Response;
      try {
        res = await doFetch(
          `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(opts.token)}&timeout=${Math.floor(timeoutMs / 1000)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              directUrls: handles.map((h) => `https://www.instagram.com/${h.replace(/^@/, "")}/`),
              resultsType: "posts",
              resultsLimit: opts.resultsPerProfile ?? 10,
            }),
            signal: ctl.signal,
          },
        );
      } catch (e) {
        throw new SourceError(
          name,
          (e as Error).name === "AbortError" ? "timeout" : "unavailable",
          "Apify batch failed or timed out",
        );
      } finally {
        clearTimeout(timer);
      }

      // 402 = out of credits; 403 with a usage message = monthly cap reached.
      if (res.status === 402) throw new ApifyCreditsExhausted();
      if (res.status === 403) {
        const text = await res.text().catch(() => "");
        if (/usage|limit|credit/i.test(text)) throw new ApifyCreditsExhausted();
        throw new SourceError(name, "unavailable", "Apify rejected the token (403)");
      }
      if (res.status === 429)
        throw new SourceError(name, "rate_limit", "Apify rate limited", 60_000);
      if (!res.ok) throw new SourceError(name, "unavailable", `Apify returned ${res.status}`);

      let items: unknown;
      try {
        items = await res.json();
      } catch {
        throw new SourceError(name, "malformed", "Apify returned invalid JSON");
      }
      if (!Array.isArray(items))
        throw new SourceError(name, "malformed", "Apify did not return a list");

      for (const it of items as Item[]) {
        const post = itemToPost(it);
        const owner = it.ownerUsername?.toLowerCase();
        if (!post || !owner) continue;
        out.set(owner, [...(out.get(owner) ?? []), post]);
      }
      return out;
    },
  };
}
