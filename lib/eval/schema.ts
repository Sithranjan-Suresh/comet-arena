import { z } from "zod";
import { categorySchema } from "@/lib/schemas";

/**
 * One labeled Instagram post for the extraction eval (engineering_spec §9). A human reads the post and
 * writes down the ground truth by the rules in eval/README.md. One JSON object per line in eval/cases.jsonl.
 */
export const evalLabelSchema = z
  .object({
    kind: z.enum(["competition", "results", "not_competition"]),
    /** Canonical event name as a student would say it. Null for non-competitions. */
    title: z.string().min(1).nullable(),
    /** Organizing club/department as written on the post. */
    host: z.string().min(1).nullable(),
    categories: z.array(categorySchema).default([]),
    /** First deadline as an ISO instant with offset (America/Chicago). Null when the post has no date. */
    first_deadline: z.string().datetime({ offset: true }).nullable(),
    register_url: z.string().url().nullable(),
  })
  .superRefine((l, ctx) => {
    if (l.kind === "competition" && !l.title)
      ctx.addIssue({ code: "custom", path: ["title"], message: "A competition needs a title" });
    if (l.kind === "not_competition" && (l.first_deadline || l.register_url))
      ctx.addIssue({
        code: "custom",
        path: ["kind"],
        message: "A non-competition has no deadline or registration link",
      });
  });
export type EvalLabel = z.infer<typeof evalLabelSchema>;

export const evalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits and dashes"),
  /** Permalink of the original post (kept so a label can be re-checked), or null for fixtures. */
  source_url: z.string().url().nullable(),
  org: z.string().min(1),
  posted_at: z.string().datetime({ offset: true }),
  caption: z.string(),
  /** Paths relative to the repository root. Carousel posts list every slide. */
  images: z.array(z.string().min(1)).max(10).default([]),
  label: evalLabelSchema,
  notes: z.string().default(""),
});
export type EvalCase = z.infer<typeof evalCaseSchema>;

export interface ParseIssue {
  line: number;
  id?: string;
  message: string;
}

/** Parse eval/cases.jsonl text. Collects every problem instead of stopping at the first. */
export function parseEvalCases(text: string): { cases: EvalCase[]; issues: ParseIssue[] } {
  const cases: EvalCase[] = [];
  const issues: ParseIssue[] = [];
  const ids = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim() || raw.trim().startsWith("//")) return;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      issues.push({ line, message: "Not valid JSON" });
      return;
    }
    const parsed = evalCaseSchema.safeParse(json);
    if (!parsed.success) {
      const id = (json as { id?: string } | null)?.id;
      for (const issue of parsed.error.issues)
        issues.push({ line, id, message: `${issue.path.join(".") || "(case)"}: ${issue.message}` });
      return;
    }
    if (ids.has(parsed.data.id)) {
      issues.push({ line, id: parsed.data.id, message: "Duplicate id" });
      return;
    }
    ids.add(parsed.data.id);
    cases.push(parsed.data);
  });
  return { cases, issues };
}

/** Composition the real set must reach before the eval gate means anything (spec §9). */
export const STRICT_MINIMUMS = { total: 50, not_competition: 10, results: 5 } as const;

export function checkComposition(cases: EvalCase[]): string[] {
  const n = (k: EvalCase["label"]["kind"]) => cases.filter((c) => c.label.kind === k).length;
  const problems: string[] = [];
  if (cases.length < STRICT_MINIMUMS.total)
    problems.push(`Need at least ${STRICT_MINIMUMS.total} cases (have ${cases.length})`);
  if (n("not_competition") < STRICT_MINIMUMS.not_competition)
    problems.push(
      `Need at least ${STRICT_MINIMUMS.not_competition} non-competition posts (have ${n("not_competition")})`,
    );
  if (n("results") < STRICT_MINIMUMS.results)
    problems.push(`Need at least ${STRICT_MINIMUMS.results} results posts (have ${n("results")})`);
  return problems;
}
