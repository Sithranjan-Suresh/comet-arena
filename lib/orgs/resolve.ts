export interface OrgRef {
  id: string;
  name: string;
  slug: string;
  utdclubs_slug?: string | null;
}

const STOP = new Set(["of", "for", "the", "and", "at", "in", "a", "an"]);

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "Association for Information Systems" -> "ais". Single-word names have no acronym. */
export function acronym(name: string): string | null {
  const words = norm(name.replace(/\([^)]*\)/g, " "))
    .split(" ")
    .filter((w) => w && !STOP.has(w));
  return words.length >= 2 ? words.map((w) => w[0]).join("") : null;
}

/** Every string an org can be called: full name, parenthetical, slug, UTD Clubs slug, acronym. */
function aliases(org: OrgRef): Set<string> {
  const out = new Set<string>();
  const add = (s: string | null | undefined) => {
    if (!s) return;
    const n = norm(s);
    if (n) out.add(n);
  };
  add(org.name);
  add(org.name.replace(/\([^)]*\)/g, " "));
  for (const m of org.name.matchAll(/\(([^)]+)\)/g)) add(m[1]);
  add(org.slug);
  add(org.utdclubs_slug);
  add(acronym(org.name));
  return out;
}

/**
 * Find the org a competition's host name refers to. Only returns a match when exactly ONE org fits,
 * so an ambiguous name never links a listing to the wrong club.
 */
export function resolveHostOrg(hostName: string | null | undefined, orgs: OrgRef[]): OrgRef | null {
  if (!hostName?.trim()) return null;
  const candidates = new Set<string>();
  const n = norm(hostName);
  if (n) candidates.add(n);
  const bare = norm(hostName.replace(/\([^)]*\)/g, " "));
  if (bare) candidates.add(bare);
  for (const m of hostName.matchAll(/\(([^)]+)\)/g)) candidates.add(norm(m[1]));
  candidates.delete("");

  const hits = orgs.filter((o) => {
    const a = aliases(o);
    return [...candidates].some((c) => a.has(c));
  });
  return hits.length === 1 ? hits[0] : null;
}
