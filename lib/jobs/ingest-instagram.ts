import type { IngestResult } from "@/lib/pipeline/ingest-post";
import { ApifyCreditsExhausted, type PersonalAccountFetcher } from "@/lib/sources/live/apify";
import { SourceError } from "@/lib/sources/errors";
import type { IgPost, InstagramSource } from "@/lib/sources";

export interface IgOrg {
  id: string;
  name: string;
  ig_handle: string;
  ig_account_type: "business" | "creator" | "personal_or_missing" | "unknown";
}

export interface IngestInstagramStore {
  /** Orgs with a handle, in a stable order (resume relies on it). */
  listOrgs(): Promise<IgOrg[]>;
  /** Post ids already classified (anything but `error`, which is retried). */
  knownPostIds(ids: string[]): Promise<Set<string>>;
  recordPost(row: { post: IgPost; orgId: string; result: IngestResult }): Promise<void>;
  setAccountType(orgId: string, type: IgOrg["ig_account_type"]): Promise<void>;
}

export interface IngestInstagramDeps {
  store: IngestInstagramStore;
  instagram: InstagramSource;
  apify?: PersonalAccountFetcher;
  /** Extract + dedupe + publish one post. Throws SourceError when infrastructure fails (post is retried later). */
  processPost(post: IgPost, org: IgOrg): Promise<IngestResult>;
  /** Resume point: the last org id fully processed by an earlier, interrupted run. */
  resumeAfter?: string | null;
  checkpoint?: (lastOrgId: string) => Promise<void>;
  alert?: (message: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  spacingMs?: number;
  budgetMs?: number;
  log?: (event: string, data?: Record<string, unknown>) => void;
}

export interface IngestInstagramSummary {
  orgs: number;
  posts_seen: number;
  posts_new: number;
  published: number;
  skipped_known: number;
  errors: number;
  personal_queued: number;
  incomplete: boolean;
  stopped?: "quota" | "budget" | "apify_credits";
  elapsedMs: number;
}

const HALF_HOUR = 30 * 60_000;

export async function runIngestInstagram(
  deps: IngestInstagramDeps,
): Promise<IngestInstagramSummary> {
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const spacing = deps.spacingMs ?? 2000;
  const budget = deps.budgetMs ?? HALF_HOUR;
  const log = deps.log ?? (() => {});
  const started = now();
  const s: IngestInstagramSummary = {
    orgs: 0,
    posts_seen: 0,
    posts_new: 0,
    published: 0,
    skipped_known: 0,
    errors: 0,
    personal_queued: 0,
    incomplete: false,
    elapsedMs: 0,
  };

  let orgs = await deps.store.listOrgs();
  if (deps.resumeAfter) {
    const i = orgs.findIndex((o) => o.id === deps.resumeAfter);
    if (i >= 0) orgs = orgs.slice(i + 1);
  }

  const handle = async (org: IgOrg, posts: IgPost[]) => {
    s.posts_seen += posts.length;
    const known = await deps.store.knownPostIds(posts.map((p) => p.id));
    s.skipped_known += posts.filter((p) => known.has(p.id)).length;
    // Oldest first, so listings are created in the order clubs posted them.
    for (const post of posts
      .filter((p) => !known.has(p.id))
      .sort((a, b) => a.postedAt.localeCompare(b.postedAt))) {
      s.posts_new++;
      try {
        const result = await deps.processPost(post, org);
        await deps.store.recordPost({ post, orgId: org.id, result });
        if (result.outcome === "published" || result.outcome === "merged") s.published++;
        if (result.class === "error") s.errors++;
      } catch (e) {
        // Infrastructure failure: do not record, so this post is retried next run.
        s.errors++;
        log("post_failed", {
          org: org.id,
          post: post.id,
          error: String((e as Error).message ?? e),
        });
      }
    }
  };

  const personal: IgOrg[] = [];

  for (const org of orgs) {
    if (now() - started > budget) {
      s.stopped = "budget";
      s.incomplete = true;
      break;
    }
    s.orgs++;
    if (org.ig_account_type === "personal_or_missing") {
      personal.push(org);
      continue;
    }
    try {
      const res = await deps.instagram.fetchRecentPosts(org.ig_handle, { limit: 10 });
      if (res.status === "no_account") {
        await deps.store.setAccountType(org.id, "personal_or_missing");
        personal.push(org);
      } else {
        if (org.ig_account_type === "unknown") await deps.store.setAccountType(org.id, "business");
        await handle(org, res.posts);
      }
    } catch (e) {
      if (e instanceof SourceError && e.kind === "rate_limit") {
        s.stopped = "quota";
        s.incomplete = true;
        log("quota_stop", { at_org: org.id });
        break; // resume from the previous org next run
      }
      s.errors++;
      log("org_failed", { org: org.id, error: String((e as Error).message ?? e) });
    }
    await deps.checkpoint?.(org.id);
    await sleep(spacing);
  }

  // Personal accounts go to Apify in one batch (it is billed per run).
  if (personal.length > 0 && deps.apify && !s.stopped) {
    s.personal_queued = personal.length;
    try {
      const batch = await deps.apify.fetchBatch(personal.map((o) => o.ig_handle));
      for (const org of personal)
        await handle(org, batch.get(org.ig_handle.replace(/^@/, "").toLowerCase()) ?? []);
    } catch (e) {
      if (e instanceof ApifyCreditsExhausted) {
        s.stopped = "apify_credits";
        await deps.alert?.(
          "Apify monthly credits are exhausted; personal Instagram accounts were skipped.",
        );
      } else {
        s.errors++;
        log("apify_failed", { error: String((e as Error).message ?? e) });
      }
    }
  }

  s.elapsedMs = now() - started;
  return s;
}
