import { type Club, clubSchema } from "@/lib/orgs/merge";
import { SourceError } from "../errors";
import type { ClubsSource } from "../types";

export const DEFAULT_CLUBS_BASE_URL = "https://api.utdnebula.com";

export interface UtdClubsOptions {
  apiKey?: string;
  /** Override if Nebula moves the API (UTDCLUBS_BASE_URL). */
  baseUrl?: string;
  concurrency?: number;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** tRPC-style `{result:{data:X}}` (optionally with `.json`), or a bare payload. */
export function unwrap(body: unknown): unknown {
  const b = body as { result?: { data?: unknown } } | null;
  const d = b?.result?.data ?? body;
  return (d as { json?: unknown } | null)?.json ?? d;
}

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys)
    if (typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim();
  return null;
};

/** Normalize one raw club record; null when it is not recognizably a club (schema drift). */
export function normalizeClub(raw: unknown): Club | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const slug = pick(o, "slug", "id", "_id");
  const name = pick(o, "name", "title");
  if (!slug || !name) return null;
  const tags = Array.isArray(o.tags)
    ? o.tags.filter((t): t is string => typeof t === "string")
    : [];
  const parsed = clubSchema.safeParse({
    slug,
    name,
    description: pick(o, "description", "about"),
    tags,
    instagram: pick(o, "instagram", "instagram_handle"),
    discord: pick(o, "discord", "discord_url"),
    campusgroups_id: pick(o, "campusgroups_id", "campusGroupsId"),
  });
  return parsed.success ? parsed.data : null;
}

export function createUtdClubs(opts: UtdClubsOptions = {}): ClubsSource {
  const base = (opts.baseUrl ?? DEFAULT_CLUBS_BASE_URL).replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  const concurrency = opts.concurrency ?? 6;
  const delayMs = opts.delayMs ?? 200;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const name = "utdclubs";

  async function call(path: string, input?: unknown): Promise<unknown> {
    const url = `${base}/${path}${input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(url, {
        headers: opts.apiKey ? { "x-api-key": opts.apiKey } : {},
        signal: ctl.signal,
      });
    } catch (e) {
      throw new SourceError(
        name,
        (e as Error).name === "AbortError" ? "timeout" : "unavailable",
        `${path} failed`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429)
      throw new SourceError(
        name,
        "rate_limit",
        `${path} rate limited`,
        Number(res.headers.get("retry-after") ?? 0) * 1000 || undefined,
      );
    if (res.status === 404) throw new SourceError(name, "not_found", `${path} not found`);
    if (!res.ok) throw new SourceError(name, "unavailable", `${path} returned ${res.status}`);
    try {
      return unwrap(await res.json());
    } catch {
      throw new SourceError(name, "malformed", `${path} returned invalid JSON`);
    }
  }

  return {
    async fetchClubs() {
      const list = await call("club.all");
      if (!Array.isArray(list))
        throw new SourceError(name, "malformed", "club.all did not return a list");

      const clubs: Club[] = [];
      let bad = 0;
      let next = 0;
      const worker = async () => {
        while (next < list.length) {
          const item = list[next++] as Record<string, unknown> | null;
          const slug = item && typeof item === "object" ? pick(item, "slug", "id", "_id") : null;
          let detail: unknown = item;
          if (slug) {
            try {
              detail = { ...item, ...((await call("club.getDirectoryInfo", { slug })) as object) };
            } catch (e) {
              // One club's detail failing keeps the list-level data rather than dropping the club.
              if (e instanceof SourceError && e.kind === "rate_limit") throw e;
            }
            await sleep(delayMs);
          }
          const club = normalizeClub(detail);
          if (club) clubs.push(club);
          else bad++;
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));

      // Most rows unrecognizable means the response shape changed, not that clubs vanished.
      if (list.length > 0 && bad / list.length > 0.2)
        throw new SourceError(
          name,
          "malformed",
          `${bad} of ${list.length} clubs did not match the expected shape`,
        );
      return clubs.sort((a, b) => a.slug.localeCompare(b.slug));
    },
  };
}
