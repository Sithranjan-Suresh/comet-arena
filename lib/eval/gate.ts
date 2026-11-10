import { GATE } from "./report";

export interface GateInput {
  /** Per-mode results.json entries: { gate: { first_deadline: 0.9, ... } } */
  current: Record<string, number | null>;
  /** Last accepted numbers (eval/baseline.json), or null when none exists yet. */
  baseline: Record<string, number | null> | null;
  /** Allowed drop versus the baseline before the gate fails (absolute, 0.02 = 2 points). */
  tolerance?: number;
  /** Also enforce the absolute minimums (real runs). Mock runs only guard against regressions. */
  absolute: boolean;
}

export interface GateOutcome {
  ok: boolean;
  failures: string[];
}

export function checkGate({
  current,
  baseline,
  tolerance = 0.02,
  absolute,
}: GateInput): GateOutcome {
  const failures: string[] = [];
  for (const [name, min] of Object.entries(GATE)) {
    const value = current[name];
    if (value === null || value === undefined) {
      failures.push(`${name}: no result`);
      continue;
    }
    if (absolute && value < min)
      failures.push(
        `${name}: ${(value * 100).toFixed(1)}% is below the ${(min * 100).toFixed(0)}% minimum`,
      );
    const prev = baseline?.[name];
    if (prev !== null && prev !== undefined && value < prev - tolerance)
      failures.push(
        `${name}: dropped from ${(prev * 100).toFixed(1)}% to ${(value * 100).toFixed(1)}%`,
      );
  }
  return { ok: failures.length === 0, failures };
}
