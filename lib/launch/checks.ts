/** Launch criteria from product_spec §1 and engineering_spec §13, as pure checks over counts. */

export interface CompetitionRow {
  status: "live" | "unverified" | "expected" | "past" | "rejected";
  categories: string[];
  source_count: number;
  has_stages: boolean;
}

export interface CriterionResult {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export const TARGETS = { live: 40, pastOrExpected: 50, categories: 5 } as const;

/**
 * "Live" in the launch sense means currently listed and upcoming-or-open, not necessarily admin-verified:
 * `live` plus `unverified` (published by ingestion at confidence >= 0.8). Past and expected come from the
 * hand-collected starter set and ingestion history.
 */
export function evaluateLaunchCounts(rows: CompetitionRow[]): CriterionResult[] {
  const visible = rows.filter((r) => r.status !== "rejected");
  const listedLive = visible.filter((r) => r.status === "live" || r.status === "unverified");
  const history = visible.filter((r) => r.status === "past" || r.status === "expected");
  const cats = new Set(visible.flatMap((r) => r.categories).filter((c) => c !== "other"));
  const withoutSource = visible.filter((r) => r.source_count === 0);
  const undated = listedLive.filter((r) => !r.has_stages);
  return [
    {
      id: "live",
      label: `At least ${TARGETS.live} live listings`,
      ok: listedLive.length >= TARGETS.live,
      detail: `${listedLive.length} listed (live + unverified)`,
    },
    {
      id: "history",
      label: `At least ${TARGETS.pastOrExpected} past or expected listings`,
      ok: history.length >= TARGETS.pastOrExpected,
      detail: `${history.length} past/expected`,
    },
    {
      id: "categories",
      label: `At least ${TARGETS.categories} categories`,
      ok: cats.size >= TARGETS.categories,
      detail: `${cats.size} categories: ${[...cats].sort().join(", ") || "none"}`,
    },
    {
      id: "sources",
      label: "Every listing shows a source",
      ok: withoutSource.length === 0,
      detail: withoutSource.length
        ? `${withoutSource.length} without a source`
        : "all have a source",
    },
    {
      id: "dates",
      label: "Every live listing has at least one dated round",
      ok: undated.length === 0,
      detail: undated.length ? `${undated.length} live listings without dates` : "all dated",
    },
  ];
}

export const REQUIRED_LIVE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "GROQ_API_KEY",
  "EMBEDDINGS_API_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "ADMIN_EMAIL",
  "UNSUBSCRIBE_SECRET",
  "EXTRACT_INTERNAL_KEY",
] as const;

/** Names of required settings that are missing or still look like placeholders. */
export function missingEnv(
  env: Record<string, string | undefined>,
  required: readonly string[] = REQUIRED_LIVE_ENV,
): string[] {
  return required.filter((k) => {
    const v = env[k]?.trim();
    return !v || /^(changeme|todo|xxx|your[-_ ])/i.test(v);
  });
}

export function summarize(results: CriterionResult[]): { ok: boolean; failed: CriterionResult[] } {
  const failed = results.filter((r) => !r.ok);
  return { ok: failed.length === 0, failed };
}
