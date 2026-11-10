import type { Eligibility, GameDayDTO, SourceType } from "@/lib/schemas";

/** Only http(s) URLs are ever linked: listing data comes from scraped posts and submissions. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export const COST_LABEL: Record<GameDayDTO["cost"], string> = {
  free: "Free",
  paid: "Paid entry",
  unknown: "Cost not listed",
};
export const FORMAT_LABEL: Record<GameDayDTO["format"], string> = {
  in_person: "In person",
  virtual: "Virtual",
  hybrid: "Hybrid",
  unknown: "Format not listed",
};
export const TIER_LABEL: Record<GameDayDTO["tier"], string> = {
  campus: "Campus",
  regional: "Regional",
  national: "National",
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  instagram: "Instagram post",
  submission: "Submitted by a student",
  host: "Host page",
  devpost: "Devpost",
  mlh: "MLH",
  dept: "Department page",
  utdclubs: "UTD Clubs",
  campusgroups: "CampusGroups",
};

/** "Teams of 3 to 4", "Solo", "Teams up to 4", or null when unknown. */
export function teamSizeLabel(e: Pick<Eligibility, "team_min" | "team_max"> | null): string | null {
  if (!e || (e.team_min == null && e.team_max == null)) return null;
  const { team_min: min, team_max: max } = e;
  if (min === 1 && max === 1) return "Solo";
  if (min != null && max != null)
    return min === max ? `Teams of ${min}` : `Teams of ${min} to ${max}`;
  if (max != null) return `Teams up to ${max}`;
  return `Teams of at least ${min}`;
}

const YEAR = (y: string) => y.charAt(0).toUpperCase() + y.slice(1) + "s";

/** Plain-language eligibility lines for the page, e.g. ["Open to Accounting and Finance majors", "Juniors and Seniors"]. */
export function eligibilityLines(e: Eligibility | null): string[] {
  if (!e) return ["Open to all UTD students"];
  const lines: string[] = [];
  if (e.majors.length) {
    lines.push(
      e.cross_school
        ? `Aimed at ${list(e.majors)} majors, open to all schools`
        : `Open to ${list(e.majors)} majors`,
    );
  }
  if (e.class_years.length) lines.push(list(e.class_years.map(YEAR)));
  if (e.course_prereqs.length) lines.push(`Prerequisites: ${list(e.course_prereqs)}`);
  const team = teamSizeLabel(e);
  if (team) lines.push(team);
  if (!e.majors.length && !e.class_years.length && !e.course_prereqs.length)
    lines.unshift("Open to all UTD students");
  return lines;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Event structured data for search engines. Output is safe to embed in a <script> tag. */
export function eventJsonLd(dto: GameDayDTO, baseUrl: string): string {
  const first = [...dto.stages].sort((a, b) => a.deadline_at.localeCompare(b.deadline_at))[0];
  const last = [...dto.stages].sort((a, b) => b.deadline_at.localeCompare(a.deadline_at))[0];
  const data = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: dto.title,
    description: dto.description ?? undefined,
    url: `${baseUrl.replace(/\/+$/, "")}/game/${dto.slug}`,
    startDate: dto.stages.find((s) => s.starts_at)?.starts_at ?? first?.deadline_at,
    endDate: last?.deadline_at,
    eventStatus:
      dto.status === "past"
        ? "https://schema.org/EventCompleted"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode:
      dto.format === "virtual"
        ? "https://schema.org/OnlineEventAttendanceMode"
        : dto.format === "hybrid"
          ? "https://schema.org/MixedEventAttendanceMode"
          : "https://schema.org/OfflineEventAttendanceMode",
    location: dto.location ? { "@type": "Place", name: dto.location } : undefined,
    organizer: dto.host_name ? { "@type": "Organization", name: dto.host_name } : undefined,
    isAccessibleForFree: dto.cost === "free" ? true : undefined,
  };
  // "<" must not appear raw inside a <script>: a title containing "</script>" would otherwise break out.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
