/** Course code helpers. Students type "cs1337", "CS 1337" or "cs-1337"; all mean the same course. */

export type CourseGraph = Map<string, string[]>;

/** "cs1337" -> "CS 1337". Anything that is not subject letters plus a 4-digit number is returned trimmed and upper-cased. */
export function normalizeCourse(input: string): string {
  const s = input.trim().toUpperCase();
  const m = /^([A-Z]{2,5})[\s\-_.]*(\d{4})$/.exec(s);
  return m ? `${m[1]} ${m[2]}` : s.replace(/\s+/g, " ");
}

/** Every course code mentioned anywhere in a free-form value (a Nebula prerequisite tree, a sentence, ...). */
export function extractCourseCodes(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      for (const m of v.matchAll(/\b([A-Za-z]{2,5})[\s\-_.]?(\d{4})\b/g))
        found.add(`${m[1].toUpperCase()} ${m[2]}`);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return [...found];
}

/**
 * Courses the student is taken to have satisfied: what they listed plus, transitively, the prerequisites of
 * those courses (anyone who completed CS 4348 has completed CS 3345 and what it requires). Pure and bounded.
 */
export function expandCourses(taken: string[], graph: CourseGraph | null, maxDepth = 6): string[] {
  const out = new Set(taken.map(normalizeCourse).filter(Boolean));
  if (!graph) return [...out];
  let frontier = [...out];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const c of frontier)
      for (const p of graph.get(c) ?? []) {
        const n = normalizeCourse(p);
        if (!out.has(n)) {
          out.add(n);
          next.push(n);
        }
      }
    frontier = next;
  }
  return [...out];
}
