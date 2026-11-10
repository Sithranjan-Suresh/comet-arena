/** Filter state for The Field lives in the URL so any filtered view is shareable and back-button friendly. */
export interface FieldFilters {
  q?: string;
  categories?: string[];
  format?: string;
  cost?: string;
  utd_only?: boolean;
  beginner?: boolean;
  include_past?: boolean;
  host?: string;
  from?: string;
  to?: string;
}

const SCALAR_KEYS = ["q", "format", "cost", "host", "from", "to"] as const;
const BOOL_KEYS = ["utd_only", "beginner", "include_past"] as const;

/**
 * Apply a patch to the current search params. `undefined`, empty strings, empty arrays and `false`
 * remove a parameter. Changing any filter resets paging (the cursor is dropped).
 */
export function applyFieldPatch(
  current: URLSearchParams,
  patch: Partial<FieldFilters>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete("cursor");

  for (const key of SCALAR_KEYS) {
    if (!(key in patch)) continue;
    const v = patch[key];
    if (v === undefined || v === "") next.delete(key);
    else next.set(key, v);
  }
  for (const key of BOOL_KEYS) {
    if (!(key in patch)) continue;
    const v = patch[key];
    if (v) next.set(key, "1");
    else next.delete(key);
  }
  if ("categories" in patch) {
    next.delete("categories");
    for (const c of [...new Set(patch.categories ?? [])]) next.append("categories", c);
  }
  return next;
}

export function fieldHref(params: URLSearchParams, base = "/field"): string {
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Keys that count as "a filter is active" (everything except paging). */
export function activeFilterCount(params: URLSearchParams): number {
  let n = 0;
  for (const k of SCALAR_KEYS) if (params.get(k)) n++;
  for (const k of BOOL_KEYS) if (params.get(k) === "1" || params.get(k) === "true") n++;
  n += new Set(
    params
      .getAll("categories")
      .flatMap((c) => c.split(","))
      .filter(Boolean),
  ).size;
  return n;
}

export function selectedCategories(params: URLSearchParams): string[] {
  return [
    ...new Set(
      params
        .getAll("categories")
        .flatMap((c) => c.split(","))
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  ];
}

/** Deadline-window presets for the filter bar: "this week", "next 30 days" as YYYY-MM-DD in Chicago. */
export function windowPreset(
  preset: "any" | "7" | "30",
  today: Date = new Date(),
): Pick<FieldFilters, "from" | "to"> {
  if (preset === "any") return { from: undefined, to: undefined };
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const end = new Date(today.getTime() + Number(preset) * 86_400_000);
  return { from: fmt(today), to: fmt(end) };
}

/** Which preset the current from/to correspond to (so the select shows it), or "custom"/"any". */
export function currentWindow(
  params: URLSearchParams,
  today: Date = new Date(),
): "any" | "7" | "30" | "custom" {
  const from = params.get("from");
  const to = params.get("to");
  if (!from && !to) return "any";
  for (const p of ["7", "30"] as const) {
    const w = windowPreset(p, today);
    if (w.from === from && w.to === to) return p;
  }
  return "custom";
}
