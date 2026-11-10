import ICAL from "ical.js";
import { SourceError } from "../errors";
import type { CampusEvent, EventSource } from "../types";

export interface EventsOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

async function getText(
  source: string,
  url: string,
  headers: Record<string, string>,
  o: EventsOptions,
): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 15000);
  try {
    const res = await (o.fetchImpl ?? fetch)(url, { headers, signal: ctl.signal });
    if (res.status === 429) throw new SourceError(source, "rate_limit", "rate limited", 60_000);
    if (!res.ok) throw new SourceError(source, "unavailable", `HTTP ${res.status}`);
    return await res.text();
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

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const iso = (v: unknown) => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null;
};

/** Normalize one raw UTD Clubs event; null when it lacks an id, title or start (schema drift). */
export function normalizeClubEvent(raw: unknown): CampusEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id) ?? str(o._id) ?? str(o.slug);
  const title = str(o.name) ?? str(o.title);
  const start = iso(o.start_time) ?? iso(o.start) ?? iso(o.startTime);
  if (!id || !title || !start) return null;
  const club = str(o.host) ?? str(o.club_name) ?? str(o.clubName) ?? str(o.organization);
  return {
    source: "utdclubs",
    externalId: id,
    url: str(o.url) ?? `https://www.utdallas.edu/events/${encodeURIComponent(id)}`,
    title,
    description: str(o.description) ?? "",
    host: club,
    location: str(o.location),
    start,
    end: iso(o.end_time) ?? iso(o.end) ?? iso(o.endTime),
  };
}

/** UTD Clubs events through the same API as the club directory (`event.findByDateRange`). Endpoint shape unverified. */
export function createUtdClubsEvents(o: EventsOptions = {}): EventSource {
  const base = (o.baseUrl ?? "https://api.utdnebula.com").replace(/\/$/, "");
  return {
    async fetchEvents({ from, to }) {
      const input = encodeURIComponent(
        JSON.stringify({ starts_after: from.toISOString(), starts_before: to.toISOString() }),
      );
      const text = await getText(
        "utdclubs-events",
        `${base}/event.findByDateRange?input=${input}`,
        o.apiKey ? { "x-api-key": o.apiKey } : {},
        o,
      );
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new SourceError("utdclubs-events", "malformed", "invalid JSON");
      }
      const list = (body as { result?: { data?: unknown } })?.result?.data ?? body;
      const arr = Array.isArray((list as { json?: unknown })?.json)
        ? (list as { json: unknown[] }).json
        : list;
      if (!Array.isArray(arr))
        throw new SourceError("utdclubs-events", "malformed", "events were not a list");
      const events = arr.map(normalizeClubEvent).filter((e): e is CampusEvent => e !== null);
      if (arr.length > 0 && events.length / arr.length < 0.8)
        throw new SourceError(
          "utdclubs-events",
          "malformed",
          "most events did not match the expected shape",
        );
      return events;
    },
  };
}

/** Parse an iCalendar feed into events inside the range. Recurring events are expanded by the caller's feed; we read VEVENTs as listed. */
export function parseIcsEvents(ics: string, range: { from: Date; to: Date }): CampusEvent[] {
  let comp: ICAL.Component;
  try {
    comp = new ICAL.Component(ICAL.parse(ics));
  } catch {
    throw new SourceError("campusgroups", "malformed", "invalid iCalendar data");
  }
  const out: CampusEvent[] = [];
  for (const v of comp.getAllSubcomponents("vevent")) {
    const e = new ICAL.Event(v);
    if (!e.uid || !e.summary || !e.startDate) continue;
    const start = e.startDate.toJSDate();
    if (start < range.from || start > range.to) continue;
    out.push({
      source: "campusgroups",
      externalId: e.uid,
      url: str(v.getFirstPropertyValue("url")) ?? "https://utdallas.campusgroups.com/events",
      title: e.summary.trim(),
      description: (e.description ?? "").trim(),
      host: str(v.getFirstPropertyValue("organizer")) ?? null,
      location: e.location?.trim() || null,
      start: start.toISOString(),
      end: e.endDate ? e.endDate.toJSDate().toISOString() : null,
    });
  }
  return out;
}

/** CampusGroups public events through the school's iCal feed (set CAMPUSGROUPS_ICAL_URL). */
export function createCampusGroups(o: EventsOptions & { icalUrl?: string } = {}): EventSource {
  return {
    async fetchEvents(range) {
      if (!o.icalUrl)
        throw new SourceError(
          "campusgroups",
          "unavailable",
          "CAMPUSGROUPS_ICAL_URL is not configured",
        );
      return parseIcsEvents(
        await getText("campusgroups", o.icalUrl, { accept: "text/calendar" }, o),
        range,
      );
    },
  };
}
