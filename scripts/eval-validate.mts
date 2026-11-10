// Validate eval/cases.jsonl: schema, unique ids, image files exist.
//   npm run eval:validate            (any size; used in CI on the mock set)
//   npm run eval:validate -- --strict (also enforces the real-set composition: 50 cases, 10 non-competition, 5 results)
import { existsSync, readFileSync } from "node:fs";
import { STRICT_MINIMUMS, checkComposition, parseEvalCases } from "../lib/eval/schema";

const file = process.argv.find((a) => a.endsWith(".jsonl")) ?? "eval/cases.jsonl";
const strict = process.argv.includes("--strict");
const { cases, issues } = parseEvalCases(readFileSync(file, "utf8"));

for (const c of cases)
  for (const img of c.images)
    if (!existsSync(img)) issues.push({ line: 0, id: c.id, message: `Image not found: ${img}` });
const problems = strict ? checkComposition(cases) : [];

for (const i of issues) console.error(`line ${i.line}${i.id ? ` [${i.id}]` : ""}: ${i.message}`);
for (const p of problems) console.error(p);
console.log(
  `${cases.length} valid cases in ${file}${strict ? ` (strict: needs ${STRICT_MINIMUMS.total}+)` : ""}`,
);
if (issues.length || problems.length) process.exit(1);
