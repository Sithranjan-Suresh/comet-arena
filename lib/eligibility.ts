import type { Eligibility, EligibilityVerdict } from "@/lib/schemas";

export interface ViewerProfile {
  major: string | null;
  class_year: string | null;
  courses?: string[] | null;
}

type Rules = Pick<Eligibility, "majors" | "class_years" | "course_prereqs" | "cross_school">;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\([^)]*\)/g, " ") // "Computer Science (BS)" -> "computer science"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Common short forms students actually type. */
const MAJOR_ALIASES: Record<string, string> = {
  cs: "computer science",
  se: "software engineering",
  ce: "computer engineering",
  ee: "electrical engineering",
  me: "mechanical engineering",
  bme: "biomedical engineering",
  ds: "data science",
  mis: "information technology and systems",
  its: "information technology and systems",
  "business admin": "business administration",
};

function canonMajor(s: string): string {
  const n = norm(s);
  return MAJOR_ALIASES[n] ?? n;
}

function majorMatches(profileMajor: string, allowed: string[]): boolean {
  const p = canonMajor(profileMajor);
  return allowed.some((a) => {
    const c = canonMajor(a);
    return c === p || (c.length >= 4 && p.includes(c)) || (p.length >= 4 && c.includes(p));
  });
}

/**
 * "You qualify" / "Check eligibility" for a signed-in viewer (product_spec P1-2).
 *  - empty restriction arrays mean open to all
 *  - a known mismatch is "check" (never a hard no: rules on flyers are often loose)
 *  - if a restriction cannot be evaluated because the profile lacks the field, "unknown"
 *  - cross_school competitions are open to every major
 */
export function evaluateEligibility(
  rules: Rules | null,
  profile: ViewerProfile,
): EligibilityVerdict {
  if (!rules) return "qualifies"; // no eligibility row at all: nothing restricts entry

  let mismatch = false;
  let unknown = false;

  if (rules.majors.length > 0 && !rules.cross_school) {
    if (!profile.major?.trim()) unknown = true;
    else if (!majorMatches(profile.major, rules.majors)) mismatch = true;
  }

  if (rules.class_years.length > 0) {
    if (!profile.class_year) unknown = true;
    else if (
      !rules.class_years.map((y) => y.toLowerCase()).includes(profile.class_year.toLowerCase())
    )
      mismatch = true;
  }

  if (rules.course_prereqs.length > 0) {
    const have = new Set((profile.courses ?? []).map(norm));
    if (have.size === 0) unknown = true;
    else if (!rules.course_prereqs.every((c) => have.has(norm(c)))) mismatch = true;
  }

  if (mismatch) return "check";
  if (unknown) return "unknown";
  return "qualifies";
}

export const ELIGIBILITY_LABEL: Record<EligibilityVerdict, string> = {
  qualifies: "You qualify",
  check: "Check eligibility",
  unknown: "Add your major and class year to check eligibility",
};
