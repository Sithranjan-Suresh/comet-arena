import type { CaseResult, Summary } from "./metrics";
import type { EvalRun } from "./run";

const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);

/** Names the gate checks (Task 107). Thresholds are minimums. */
export const GATE: Record<string, number> = {
  first_deadline: 0.85,
  title: 0.85,
  is_competition_recall: 0.9,
  is_competition_precision: 0.9,
};

export function gateValues(s: Summary): Record<string, number | null> {
  return {
    first_deadline: s.first_deadline,
    title: s.title,
    is_competition_recall: s.is_competition.recall,
    is_competition_precision: s.is_competition.precision,
  };
}

function failures(run: EvalRun): string[] {
  const out: string[] = [];
  for (const r of run.results) {
    const bad: string[] = [];
    const e = r.expected;
    const p = r.predicted;
    if (!r.ok.kind) bad.push(`kind: expected ${e.kind}, got ${p.kind}`);
    if (r.ok.title === false) bad.push(`title: expected "${e.title}", got "${p.title}"`);
    if (r.ok.first_deadline === false)
      bad.push(`first deadline: expected ${e.first_deadline}, got ${p.first_deadline}`);
    if (r.ok.register_url === false)
      bad.push(`register url: expected ${e.register_url}, got ${p.register_url}`);
    if (r.cat.fp + r.cat.fn > 0)
      bad.push(
        `categories: expected [${e.categories.join(", ")}], got [${p.categories.join(", ")}]`,
      );
    if (bad.length) out.push(`- \`${r.id}\`: ${bad.join("; ")}`);
  }
  return out;
}

export function renderReport(
  runs: EvalRun[],
  meta: { generatedOn: string; caseCount: number; mockMode: boolean },
): string {
  const lines: string[] = [];
  lines.push("# Extraction eval report", "");
  lines.push(`Generated ${meta.generatedOn} over ${meta.caseCount} labeled posts.`);
  if (meta.mockMode)
    lines.push(
      "",
      "> **Mock run.** The model is a fixture that returns the canned answer for known flyers, so these numbers only prove the harness works. Run with `SOURCES_MODE=live` on the real labeled set for a meaningful result.",
    );
  lines.push("", "## Per-field results", "");
  lines.push(
    `| Metric | ${runs.map((r) => (r.mode === "image" ? "Image + caption" : "Caption only (baseline)")).join(" | ")} | Gate |`,
  );
  lines.push(`|---|${runs.map(() => "---:").join("|")}|---:|`);
  const rows: [string, (s: Summary) => number | null, number | undefined][] = [
    ["First deadline (exact)", (s) => s.first_deadline, GATE.first_deadline],
    ["Title (normalized)", (s) => s.title, GATE.title],
    ["Register URL (normalized)", (s) => s.register_url, undefined],
    ["Is-competition precision", (s) => s.is_competition.precision, GATE.is_competition_precision],
    ["Is-competition recall", (s) => s.is_competition.recall, GATE.is_competition_recall],
    ["Is-competition F1", (s) => s.is_competition.f1, undefined],
    ["Category F1 (micro)", (s) => s.category_f1, undefined],
  ];
  for (const [label, pick, gate] of rows)
    lines.push(
      `| ${label} | ${runs.map((r) => pct(pick(r.summary))).join(" | ")} | ${gate === undefined ? "" : `≥ ${pct(gate)}`} |`,
    );
  lines.push(`| Pipeline errors | ${runs.map((r) => String(r.summary.errors)).join(" | ")} | |`);

  for (const run of runs) {
    const f = failures(run);
    lines.push(
      "",
      `## Failures: ${run.mode === "image" ? "image + caption" : "caption only"} (${f.length})`,
      "",
    );
    lines.push(...(f.length ? f : ["None."]));
  }
  return lines.join("\n") + "\n";
}

/** Compact machine-readable form used by the regression gate. */
export function toResultsJson(runs: EvalRun[]) {
  return Object.fromEntries(
    runs.map((r) => [r.mode, { ...r.summary, gate: gateValues(r.summary) }]),
  );
}

export type { CaseResult };
