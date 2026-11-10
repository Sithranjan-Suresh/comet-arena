// Run the extraction eval and write eval/report.md + eval/results.json.
//   npm run eval                      mock model over eval/cases.jsonl (harness check)
//   SOURCES_MODE=live npm run eval    real model; use the hand-labeled set. Costs API calls.
//   options: --cases path.jsonl  --limit N  --no-baseline
import { readFileSync, writeFileSync } from "node:fs";
import { diskImageResolver, runEval } from "../lib/eval/run";
import { renderReport, toResultsJson } from "../lib/eval/report";
import { parseEvalCases } from "../lib/eval/schema";
import { maxImages } from "../lib/extract/deps";
import { getSources } from "../lib/sources";
import { mockVision } from "../lib/sources/mock/adapters";
import { Chaos } from "../lib/sources/mock/chaos";

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = opt("cases") ?? "eval/cases.jsonl";
const limit = opt("limit") ? Number(opt("limit")) : undefined;

const { cases: all, issues } = parseEvalCases(readFileSync(file, "utf8"));
if (issues.length) {
  for (const i of issues) console.error(`line ${i.line}: ${i.message}`);
  console.error("Fix the eval set first (npm run eval:validate).");
  process.exit(2);
}
const cases = limit ? all.slice(0, limit) : all;

const sources = getSources();
const mock = sources.mode === "mock";
// The harness must be deterministic: no injected latency or failures in mock mode.
const vision = mock
  ? mockVision(
      new Chaos({
        latencyMs: [0, 0],
        malformedRate: 0,
        timeoutRate: 0,
        rateLimitAtCall: 0,
        sleep: async () => {},
      }),
    )
  : sources.vision;
const deps = {
  vision,
  mode: sources.mode,
  maxImages: maxImages(),
  resolveImage: diskImageResolver,
};

const runs = [];
runs.push(
  await runEval(cases, "image", deps, {
    onCase: (id, i, n) => process.stderr.write(`\r[image] ${i + 1}/${n} ${id}      `),
  }),
);
if (!args.includes("--no-baseline"))
  runs.push(
    await runEval(cases, "caption", deps, {
      onCase: (id, i, n) => process.stderr.write(`\r[caption] ${i + 1}/${n} ${id}      `),
    }),
  );
process.stderr.write("\n");

const report = renderReport(runs, {
  generatedOn: new Date().toISOString().slice(0, 10),
  caseCount: cases.length,
  mockMode: mock,
});
writeFileSync("eval/report.md", report);
writeFileSync(
  "eval/results.json",
  JSON.stringify({ mode: sources.mode, cases: cases.length, ...toResultsJson(runs) }, null, 2) +
    "\n",
);
console.log(report.split("\n## Failures")[0]);
