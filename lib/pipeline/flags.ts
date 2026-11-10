import type { Extraction, SourceType } from "@/lib/schemas";

export interface DerivedFlags {
  tier: "campus" | "regional" | "national";
  utd_only: boolean;
  beginner_friendly: boolean;
}

const NATIONAL =
  /\b(national|nationwide|international|worldwide|global|world[- ]wide|worldwide)\b/i;
const REGIONAL = /\b(regional|dfw|dallas[- ]fort worth|north texas|texas|southwest|metroplex)\b/i;
const OPEN_TO_ALL =
  /\b(open to (all )?(college |university )?students|any (college|university|school)|all (college|university) students|collegiate|students (from|at) any)\b/i;
const BEGINNER =
  /\b(beginner|beginners|no experience|first[- ]time|newcomers?|all (skill|experience) levels|never (coded|hacked)|novice)\b/i;

/**
 * Heuristics for fields extraction does not return (product_spec §4: external competitions are
 * `utd_only = false`). A competition is "external" when it is not hosted by a known UTD org and
 * the post talks about being national/international/open to all students, or it comes from a
 * Devpost/MLH feed. Everything else defaults to a UTD-only campus competition.
 */
export function deriveFlags(
  ex: Pick<Extraction, "title" | "host" | "description" | "format">,
  ctx: { caption?: string | null; hostOrgId?: string | null; source: SourceType },
): DerivedFlags {
  const text = [ex.title, ex.host, ex.description, ctx.caption].filter(Boolean).join(" \n ");
  const fromFeed = ctx.source === "devpost" || ctx.source === "mlh";
  const mentionsNational = NATIONAL.test(text);
  const externalHost = !ctx.hostOrgId;
  const external = fromFeed || (externalHost && (mentionsNational || OPEN_TO_ALL.test(text)));

  let tier: DerivedFlags["tier"] = "campus";
  if (external)
    tier =
      mentionsNational || ex.format === "virtual"
        ? "national"
        : REGIONAL.test(text)
          ? "regional"
          : "national";
  else if (mentionsNational) tier = "national"; // a UTD-run event that is itself national in scope

  return { tier, utd_only: !external, beginner_friendly: BEGINNER.test(text) };
}
