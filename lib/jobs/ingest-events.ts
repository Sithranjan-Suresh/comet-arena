import { classifyEvent, eventToExtraction } from "@/lib/events/classify";
import type { PublishOutcome } from "@/lib/pipeline/publish";
import { isSourceError } from "@/lib/sources/errors";
import type { CampusEvent, EventSource } from "@/lib/sources";
import type { Extraction } from "@/lib/schemas";

export const WINDOW_DAYS = 120;

export interface IngestEventsStore {
  /** Event ids already seen (competition or not), as `${source}:${externalId}`. */
  knownIds(ids: string[]): Promise<Set<string>>;
  record(row: {
    id: string;
    title: string;
    url: string;
    startsAt: string;
    classification: "competition" | "not_competition";
    competitionId: string | null;
  }): Promise<void>;
}

export interface IngestEventsSummary {
  fetched: number;
  new: number;
  published: number;
  skipped_known: number;
  not_competitions: number;
  maybe: number;
  errors: number;
  sources_failed: string[];
}

/**
 * Campus calendar events in the next 120 days become competitions when they look like one. Classification is
 * rule-based (free, deterministic); borderline events go to an optional `refine` (the model) or are left alone.
 * Every event is recorded once so it is never reclassified, and a source that fails is skipped with an alert.
 */
export async function runIngestEvents(deps: {
  sources: { utdclubs: EventSource; campusgroups: EventSource };
  store: IngestEventsStore;
  /** Extract + dedupe + publish a prepared extraction. */
  publish(extraction: Extraction, event: CampusEvent): Promise<PublishOutcome>;
  /** Optional second opinion for borderline events (returns an extraction, or null to skip). */
  refine?(event: CampusEvent): Promise<Extraction | null>;
  now?: Date;
  alert?: (message: string) => Promise<void>;
  log?: (e: string, d?: Record<string, unknown>) => void;
}): Promise<IngestEventsSummary> {
  const now = deps.now ?? new Date();
  const range = { from: now, to: new Date(now.getTime() + WINDOW_DAYS * 86_400_000) };
  const s: IngestEventsSummary = {
    fetched: 0,
    new: 0,
    published: 0,
    skipped_known: 0,
    not_competitions: 0,
    maybe: 0,
    errors: 0,
    sources_failed: [],
  };

  for (const name of ["utdclubs", "campusgroups"] as const) {
    let events: CampusEvent[];
    try {
      events = await deps.sources[name].fetchEvents(range);
    } catch (e) {
      const reason = isSourceError(e)
        ? `${e.kind}: ${e.message}`
        : String((e as Error).message ?? e);
      s.sources_failed.push(name);
      deps.log?.("source_failed", { source: name, reason });
      await deps.alert?.(`The ${name} events feed could not be read (${reason}). It was skipped.`);
      continue;
    }
    s.fetched += events.length;
    const id = (e: CampusEvent) => `${e.source}:${e.externalId}`;
    const known = await deps.store.knownIds(events.map(id));
    for (const event of events) {
      if (known.has(id(event))) {
        s.skipped_known++;
        continue;
      }
      s.new++;
      try {
        let verdict = classifyEvent(event);
        let extraction: Extraction | null =
          verdict === "competition" ? eventToExtraction(event) : null;
        if (verdict === "maybe") {
          s.maybe++;
          extraction = (await deps.refine?.(event)) ?? null;
          verdict = extraction ? "competition" : "no";
          if (!extraction && !deps.refine) continue; // nothing can decide: look again tomorrow, do not record
        }
        if (!extraction) {
          s.not_competitions++;
          await deps.store.record({
            id: id(event),
            title: event.title,
            url: event.url,
            startsAt: event.start,
            classification: "not_competition",
            competitionId: null,
          });
          continue;
        }
        const out = await deps.publish(extraction, event);
        const competitionId = "competition_id" in out ? out.competition_id : null;
        if (out.outcome === "published" || out.outcome === "merged") s.published++;
        await deps.store.record({
          id: id(event),
          title: event.title,
          url: event.url,
          startsAt: event.start,
          classification: "competition",
          competitionId,
        });
      } catch (e) {
        s.errors++;
        deps.log?.("event_failed", { id: id(event), error: String((e as Error).message ?? e) });
      }
    }
  }
  return s;
}
