import { chicagoWallClock } from "@/lib/tz";
import { formatCT } from "@/lib/time";

/** One stage to publish in a user's calendar feed. */
export interface IcsStage {
  stage_id: string;
  stage_name: string;
  starts_at: string | null;
  deadline_at: string;
  title: string;
  slug: string;
  register_url: string | null;
  /** When the competition last changed (drives LAST-MODIFIED so subscribers see updates). */
  updated_at: string;
}

const CRLF = "\r\n";

/** RFC 5545 TEXT escaping. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold a content line at 75 OCTETS (RFC 5545 §3.1): continuation lines start with one space.
 * Never splits a multi-byte UTF-8 character.
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75; // first line 75 octets; later lines 74 (the leading space counts)
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74;
    }
    current += ch;
    bytes += n;
  }
  if (current) parts.push(current);
  return parts.join(CRLF + " ");
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 20261121T055900Z */
export function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** 20261120 (a calendar date, no time) */
function dateStamp(y: number, m: number, d: number): string {
  return `${y}${pad(m)}${pad(d)}`;
}

/** A deadline at 23:59 Chicago time with no separate start is a "date-only" deadline: publish all-day. */
export function isDateOnlyDeadline(s: Pick<IcsStage, "starts_at" | "deadline_at">): boolean {
  if (s.starts_at) return false;
  const w = chicagoWallClock(new Date(s.deadline_at));
  return w.hour === 23 && w.minute === 59;
}

function eventLines(s: IcsStage, appUrl: string, now: Date): string[] {
  const deadline = new Date(s.deadline_at);
  const link = `${appUrl.replace(/\/+$/, "")}/game/${s.slug}`;
  const when = formatCT(s.deadline_at);
  const description = [
    `${s.stage_name} is due ${when}.`,
    s.register_url ? `Register: ${s.register_url}` : null,
    `Details: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VEVENT",
    `UID:stage-${s.stage_id}@cometarena`,
    `DTSTAMP:${utcStamp(now)}`,
    `LAST-MODIFIED:${utcStamp(new Date(s.updated_at))}`,
  ];

  if (isDateOnlyDeadline(s)) {
    const w = chicagoWallClock(deadline);
    const start = new Date(Date.UTC(w.year, w.month - 1, w.day));
    const end = new Date(start.getTime() + 86_400_000);
    lines.push(
      `DTSTART;VALUE=DATE:${dateStamp(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate())}`,
      `DTEND;VALUE=DATE:${dateStamp(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate())}`,
    );
  } else {
    const start = s.starts_at ? new Date(s.starts_at) : new Date(deadline.getTime() - 30 * 60_000);
    lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(deadline)}`);
  }

  lines.push(
    `SUMMARY:${escapeText(`${s.title}: ${s.stage_name}`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${link}`,
    "CATEGORIES:Comet Arena",
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(`${s.title}: ${s.stage_name} is due tomorrow`)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
  );
  return lines;
}

/** Build the full iCalendar document (CRLF line endings, folded lines). */
export function buildIcs(args: {
  stages: IcsStage[];
  appUrl: string;
  now?: Date;
  calendarName?: string;
}): string {
  const now = args.now ?? new Date();
  const name = args.calendarName ?? "Comet Arena deadlines";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Comet Arena//Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:America/Chicago",
    // Hints for clients that honor them: refresh every 6 hours.
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  const sorted = [...args.stages].sort(
    (a, b) => a.deadline_at.localeCompare(b.deadline_at) || a.stage_id.localeCompare(b.stage_id),
  );
  for (const s of sorted) lines.push(...eventLines(s, args.appUrl, now));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
