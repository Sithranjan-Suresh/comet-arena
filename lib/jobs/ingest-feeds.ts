import type { IngestResult } from "@/lib/pipeline/ingest-post";
import { isSourceError } from "@/lib/sources/errors";
import type { FeedListing, FeedSource } from "@/lib/sources";

export interface IngestFeedsStore {
  /** External ids already ingested for a feed source. */
  knownExternalIds(source: FeedListing["source"], ids: string[]): Promise<Set<string>>;
}

export interface IngestFeedsSummary {
  fetched: number;
  new: number;
  published: number;
  skipped_known: number;
  errors: number;
  feeds_failed: string[];
}

/**
 * Devpost and MLH listings -> text-only extraction -> dedupe -> publish. A feed that fails to fetch or parse
 * is skipped (the other still runs) and reported so the admin is alerted; it never blocks the job.
 */
export async function runIngestFeeds(deps: {
  feeds: { devpost: FeedSource; mlh: FeedSource };
  store: IngestFeedsStore;
  processListing(l: FeedListing): Promise<IngestResult>;
  alert?: (message: string) => Promise<void>;
  log?: (e: string, d?: Record<string, unknown>) => void;
}): Promise<IngestFeedsSummary> {
  const s: IngestFeedsSummary = {
    fetched: 0,
    new: 0,
    published: 0,
    skipped_known: 0,
    errors: 0,
    feeds_failed: [],
  };
  for (const name of ["devpost", "mlh"] as const) {
    let listings: FeedListing[];
    try {
      listings = await deps.feeds[name].fetchListings();
    } catch (e) {
      const reason = isSourceError(e)
        ? `${e.kind}: ${e.message}`
        : String((e as Error).message ?? e);
      s.feeds_failed.push(name);
      deps.log?.("feed_failed", { feed: name, reason });
      await deps.alert?.(`The ${name} feed could not be read (${reason}). It was skipped.`);
      continue;
    }
    s.fetched += listings.length;
    const known = await deps.store.knownExternalIds(
      name,
      listings.map((l) => l.externalId),
    );
    for (const l of listings) {
      if (known.has(l.externalId)) {
        s.skipped_known++;
        continue;
      }
      s.new++;
      try {
        const r = await deps.processListing(l);
        if (r.outcome === "published" || r.outcome === "merged") s.published++;
        if (r.class === "error") s.errors++;
      } catch (e) {
        s.errors++;
        deps.log?.("listing_failed", {
          feed: name,
          id: l.externalId,
          error: String((e as Error).message ?? e),
        });
      }
    }
  }
  return s;
}
