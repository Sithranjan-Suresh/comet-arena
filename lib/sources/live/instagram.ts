import { SourceError } from "../errors";
import type { IgFetchResult, IgPost, InstagramSource } from "../types";

export const GRAPH_VERSION = "v21.0";
/** Stop fetching once the app has used this share of its rate limit (spec: 80%). */
export const QUOTA_STOP = 80;

export interface InstagramOptions {
  userId: string;
  accessToken: string;
  timeoutMs?: number;
  /** Retries for transient failures (rate limit/outage), with exponential backoff. */
  retries?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Called with the app's usage percentage after every response. */
  onUsage?: (pct: number) => void;
}

/** Highest percentage in the `x-app-usage` / `x-business-use-case-usage` headers; 0 when absent or unparsable. */
export function parseUsage(headers: Headers): number {
  let max = 0;
  for (const h of ["x-app-usage", "x-business-use-case-usage"]) {
    const raw = headers.get(h);
    if (!raw) continue;
    try {
      const walk = (v: unknown) => {
        if (typeof v === "number") max = Math.max(max, v);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object")
          for (const [k, x] of Object.entries(v)) {
            if (k === "estimated_time_to_regain_access") continue;
            walk(x);
          }
      };
      walk(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }
  return max;
}

interface RawMedia {
  id?: string;
  caption?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  thumbnail_url?: string;
  children?: { data?: { media_url?: string }[] };
}

export function toPost(m: RawMedia): IgPost | null {
  if (!m.id || !m.permalink || !m.timestamp) return null;
  const type =
    m.media_type === "VIDEO" || m.media_type === "CAROUSEL_ALBUM" ? m.media_type : "IMAGE";
  const urls = [
    m.media_url ?? m.thumbnail_url,
    ...(m.children?.data ?? []).map((c) => c.media_url),
  ].filter((u): u is string => typeof u === "string" && u.length > 0);
  return {
    id: m.id,
    caption: m.caption ?? null,
    permalink: m.permalink,
    postedAt: new Date(m.timestamp).toISOString(),
    mediaType: type,
    mediaUrls: [...new Set(urls)],
  };
}

const RATE_CODES = new Set([4, 17, 32, 613]);

export function createInstagramBusinessDiscovery(opts: InstagramOptions): InstagramSource {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 1000;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const name = "instagram";
  let usage = 0;

  async function once(handle: string, limit: number): Promise<IgFetchResult> {
    const fields = `business_discovery.username(${handle}){media.limit(${limit}){id,caption,media_url,thumbnail_url,permalink,timestamp,media_type,children{media_url}}}`;
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${opts.userId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(opts.accessToken)}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(url, { signal: ctl.signal });
    } catch (e) {
      throw new SourceError(
        name,
        (e as Error).name === "AbortError" ? "timeout" : "unavailable",
        "request failed",
      );
    } finally {
      clearTimeout(timer);
    }
    usage = parseUsage(res.headers);
    opts.onUsage?.(usage);

    let body: {
      business_discovery?: { media?: { data?: RawMedia[] } };
      error?: { code?: number; error_subcode?: number; message?: string };
    };
    try {
      body = await res.json();
    } catch {
      throw new SourceError(
        name,
        res.ok ? "malformed" : "unavailable",
        `HTTP ${res.status} with a non-JSON body`,
      );
    }

    if (!res.ok || body.error) {
      const err = body.error ?? {};
      if (RATE_CODES.has(err.code ?? -1) || res.status === 429)
        throw new SourceError(name, "rate_limit", err.message ?? "rate limited", 60_000);
      // 110 / subcode 2207013: username not found or not a Business/Creator account. Never an outage.
      if (
        err.code === 110 ||
        err.error_subcode === 2207013 ||
        /cannot find|unable to find|not.*business/i.test(err.message ?? "")
      )
        return { status: "no_account" };
      if (err.code === 190)
        throw new SourceError(name, "unavailable", "access token expired or invalid");
      throw new SourceError(name, "unavailable", err.message ?? `HTTP ${res.status}`);
    }

    const data = body.business_discovery?.media?.data;
    if (!Array.isArray(data)) return { status: "ok", posts: [] }; // account exists with no media
    return { status: "ok", posts: data.map(toPost).filter((p): p is IgPost => p !== null) };
  }

  return {
    async fetchRecentPosts(handle, o) {
      const h = handle.replace(/^@/, "").trim();
      if (!/^[A-Za-z0-9._]{1,30}$/.test(h)) return { status: "no_account" };
      if (usage >= QUOTA_STOP)
        throw new SourceError(
          name,
          "rate_limit",
          `app usage ${usage}% (>= ${QUOTA_STOP}%); stopping`,
          3_600_000,
        );
      for (let attempt = 0; ; attempt++) {
        try {
          return await once(h, o?.limit ?? 10);
        } catch (e) {
          const transient =
            e instanceof SourceError &&
            (e.kind === "rate_limit" || e.kind === "unavailable" || e.kind === "timeout");
          const expiredToken = e instanceof SourceError && /token/.test(e.message);
          if (!transient || expiredToken || attempt >= retries) throw e;
          await sleep(base * 2 ** attempt);
        }
      }
    },
  };
}
