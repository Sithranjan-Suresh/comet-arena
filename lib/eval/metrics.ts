import type { Extraction } from "@/lib/schemas";
import type { EvalCase } from "./schema";

export type Kind = EvalCase["label"]["kind"];

/** What the pipeline predicted for one case (null extraction = it failed or errored). */
export interface Prediction {
  kind: Kind | "error";
  title: string | null;
  categories: string[];
  first_deadline: string | null;
  register_url: string | null;
}

export function toPrediction(ex: Extraction | null): Prediction {
  if (!ex)
    return { kind: "error", title: null, categories: [], first_deadline: null, register_url: null };
  const first = [...ex.stages].sort((a, b) => a.deadline_at.localeCompare(b.deadline_at))[0];
  return {
    kind: ex.kind,
    title: ex.title,
    categories: ex.categories,
    first_deadline: first?.deadline_at ?? null,
    register_url: ex.register_url,
  };
}

export const normTitle = (s: string | null) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Host + path, lowercased, no scheme/www/query/fragment/trailing slash: so tracking params do not count as misses. */
export function normUrl(u: string | null): string {
  if (!u) return "";
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

/** Same instant regardless of how the offset is written. */
export const sameInstant = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : Date.parse(a) === Date.parse(b);

export interface CaseResult {
  id: string;
  expected: EvalCase["label"];
  predicted: Prediction;
  /** Per-field correctness. Null when the field is not applicable to this case. */
  ok: {
    kind: boolean;
    title: boolean | null;
    first_deadline: boolean | null;
    register_url: boolean | null;
  };
  /** Category tallies for micro-averaged F1 (competitions only). */
  cat: { tp: number; fp: number; fn: number };
}

export function scoreCase(c: EvalCase, p: Prediction): CaseResult {
  const l = c.label;
  const isComp = l.kind === "competition";
  const expectedCats = new Set<string>(l.categories);
  const predCats = new Set<string>(p.categories);
  let tp = 0;
  for (const k of predCats) if (expectedCats.has(k)) tp++;
  return {
    id: c.id,
    expected: l,
    predicted: p,
    ok: {
      kind: p.kind === l.kind,
      title: isComp ? normTitle(p.title) === normTitle(l.title) : null,
      first_deadline: isComp ? sameInstant(p.first_deadline, l.first_deadline) : null,
      register_url: isComp ? normUrl(p.register_url) === normUrl(l.register_url) : null,
    },
    cat: isComp
      ? { tp, fp: predCats.size - tp, fn: expectedCats.size - tp }
      : { tp: 0, fp: 0, fn: 0 },
  };
}

const ratio = (n: number, d: number) => (d === 0 ? null : n / d);

export interface Summary {
  cases: number;
  /** "is a competition" = kind competition (a results recap is not a new listing). */
  is_competition: { precision: number | null; recall: number | null; f1: number | null };
  title: number | null;
  first_deadline: number | null;
  register_url: number | null;
  category_f1: number | null;
  errors: number;
}

export function summarize(results: CaseResult[]): Summary {
  let tp = 0,
    fp = 0,
    fn = 0;
  for (const r of results) {
    const pred = r.predicted.kind === "competition";
    const gold = r.expected.kind === "competition";
    if (pred && gold) tp++;
    else if (pred) fp++;
    else if (gold) fn++;
  }
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : precision === null && recall === null
        ? null
        : 0;

  const acc = (pick: (r: CaseResult) => boolean | null) => {
    const rel = results.map(pick).filter((x): x is boolean => x !== null);
    return ratio(rel.filter(Boolean).length, rel.length);
  };
  const c = results.reduce(
    (a, r) => ({ tp: a.tp + r.cat.tp, fp: a.fp + r.cat.fp, fn: a.fn + r.cat.fn }),
    { tp: 0, fp: 0, fn: 0 },
  );
  const cp = ratio(c.tp, c.tp + c.fp);
  const cr = ratio(c.tp, c.tp + c.fn);
  const catF1 = cp === null || cr === null ? null : cp + cr === 0 ? 0 : (2 * cp * cr) / (cp + cr);

  return {
    cases: results.length,
    is_competition: { precision, recall, f1 },
    title: acc((r) => r.ok.title),
    first_deadline: acc((r) => r.ok.first_deadline),
    register_url: acc((r) => r.ok.register_url),
    category_f1: catF1,
    errors: results.filter((r) => r.predicted.kind === "error").length,
  };
}
