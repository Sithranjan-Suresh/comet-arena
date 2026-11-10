import type { Extraction } from "@/lib/schemas";

/** Competitions at or above this publish as `unverified`; below go to the review queue (CL-1). */
export const PUBLISH_THRESHOLD = 0.8;
export const PENALTY = 0.1;

export interface Penalty {
  reason: "no_year" | "no_register_link" | "no_stage_date";
  amount: number;
}

export interface ConfidenceResult {
  /** Final score, 0 to 1, rounded to 2 decimals. */
  confidence: number;
  /** The model's own score before penalties. */
  modelScore: number;
  penalties: Penalty[];
  /** True when the score meets PUBLISH_THRESHOLD. */
  publishable: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Engineering_spec §4: model self-score minus 0.1 for each of {no year on a date, no register link,
 * no stage date}, clamped 0 to 1. Penalties only apply to competitions (recaps and non-competitions
 * are routed by `kind`, not by confidence).
 */
export function scoreConfidence(ex: Extraction, opts: { yearInferred: boolean }): ConfidenceResult {
  const penalties: Penalty[] = [];
  if (ex.kind === "competition") {
    if (opts.yearInferred) penalties.push({ reason: "no_year", amount: PENALTY });
    if (!ex.register_url) penalties.push({ reason: "no_register_link", amount: PENALTY });
    if (ex.stages.length === 0) penalties.push({ reason: "no_stage_date", amount: PENALTY });
  }
  const total = penalties.reduce((sum, p) => sum + p.amount, 0);
  const confidence = round2(clamp01(ex.confidence - total));
  return {
    confidence,
    modelScore: ex.confidence,
    penalties,
    publishable: confidence >= PUBLISH_THRESHOLD,
  };
}
