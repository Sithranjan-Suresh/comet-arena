import { type CourseGraph, extractCourseCodes, normalizeCourse } from "@/lib/courses";
import { SourceError } from "@/lib/sources/errors";
import type { CourseSource } from "@/lib/sources/types";

export const DEFAULT_NEBULA_BASE_URL = "https://api.utdnebula.com";
const TTL_MS = 30 * 86_400_000;

export interface NebulaOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Live Nebula course lookup. The prerequisite structure is a nested tree, so we collect every course code
 * mentioned in the course's `prerequisites` field instead of depending on its exact shape (unverified against
 * production; adjust the path/query here if Nebula's API differs).
 */
export function createNebula(opts: NebulaOptions = {}): CourseSource {
  const base = (opts.baseUrl ?? DEFAULT_NEBULA_BASE_URL).replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  const name = "nebula";
  return {
    async fetchPrereqs(code) {
      const m = /^([A-Z]{2,5}) (\d{4})$/.exec(normalizeCourse(code));
      if (!m) return null;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
      let res: Response;
      try {
        res = await doFetch(`${base}/course?subject_prefix=${m[1]}&course_number=${m[2]}`, {
          headers: opts.apiKey
            ? { "x-api-key": opts.apiKey, accept: "application/json" }
            : { accept: "application/json" },
          signal: ctl.signal,
        });
      } catch (e) {
        throw new SourceError(
          name,
          (e as Error).name === "AbortError" ? "timeout" : "unavailable",
          "request failed",
        );
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 404) return null;
      if (res.status === 429)
        throw new SourceError(
          name,
          "rate_limit",
          "rate limited",
          Number(res.headers.get("retry-after") ?? 0) * 1000 || undefined,
        );
      if (!res.ok) throw new SourceError(name, "unavailable", `HTTP ${res.status}`);
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new SourceError(name, "malformed", "invalid JSON");
      }
      const first = Array.isArray((body as { data?: unknown }).data)
        ? (body as { data: unknown[] }).data[0]
        : ((body as { data?: unknown }).data ?? body);
      if (!first || typeof first !== "object") return null;
      const prereqs = (first as { prerequisites?: unknown }).prerequisites;
      return extractCourseCodes(prereqs).filter((c) => c !== normalizeCourse(code));
    },
  };
}

export interface CourseCache {
  get(key: string): Promise<{ payload: unknown; fetched_at: string } | null>;
  set(key: string, payload: unknown): Promise<void>;
}

const key = (code: string) => `nebula:course:${normalizeCourse(code).replace(/\s/g, "")}`;

/**
 * Prerequisite graph for the courses a student listed, resolved breadth-first (bounded) through the cache.
 * Returns null when Nebula is unreachable and nothing was cached, so callers fall back to exact matching.
 * Courses Nebula does not know are cached as having no prerequisites (a negative result is still a result).
 */
export async function buildCourseGraph(
  courses: string[],
  deps: {
    source: CourseSource;
    cache?: CourseCache | null;
    now?: Date;
    maxDepth?: number;
    maxCourses?: number;
  },
): Promise<CourseGraph | null> {
  const now = (deps.now ?? new Date()).getTime();
  const graph: CourseGraph = new Map();
  let frontier = [...new Set(courses.map(normalizeCourse))].slice(0, deps.maxCourses ?? 40);
  let lookups = 0;
  let failures = 0;

  for (let depth = 0; depth < (deps.maxDepth ?? 3) && frontier.length; depth++) {
    const next: string[] = [];
    for (const code of frontier) {
      if (graph.has(code) || lookups >= (deps.maxCourses ?? 40) * 3) continue;
      let prereqs: string[] | null = null;
      const hit = await deps.cache?.get(key(code)).catch(() => null);
      if (
        hit &&
        now - Date.parse(hit.fetched_at) < TTL_MS &&
        Array.isArray((hit.payload as { prereqs?: unknown })?.prereqs)
      ) {
        prereqs = (hit.payload as { prereqs: string[] }).prereqs;
      } else {
        lookups++;
        try {
          prereqs = (await deps.source.fetchPrereqs(code)) ?? [];
          await deps.cache?.set(key(code), { prereqs }).catch(() => {});
        } catch {
          failures++;
          // Stale cache beats nothing: use an expired entry when the source is down.
          if (hit && Array.isArray((hit.payload as { prereqs?: unknown })?.prereqs))
            prereqs = (hit.payload as { prereqs: string[] }).prereqs;
        }
      }
      if (prereqs) {
        graph.set(code, prereqs);
        for (const p of prereqs) if (!graph.has(p)) next.push(p);
      }
    }
    frontier = next;
  }
  if (graph.size === 0 && failures > 0) return null;
  return graph;
}
