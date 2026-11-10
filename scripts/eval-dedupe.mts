// Score the dedupe thresholds against labeled pairs and write eval/dedupe-report.md.
//   npm run eval:dedupe                      mock embedder (harness check)
//   SOURCES_MODE=live npm run eval:dedupe    real embeddings; use this before changing thresholds
import { readFileSync, writeFileSync } from "node:fs";
import { pairsFileSchema, renderDedupeReport, scorePairs } from "../lib/eval/dedupe";
import { getSources } from "../lib/sources";

const file = process.argv.find((a) => a.endsWith(".json")) ?? "eval/dedupe-pairs.json";
const { pairs } = pairsFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
const sources = getSources();
const scored = await scorePairs(pairs, sources.embedder);
const report = renderDedupeReport(scored, {
  generatedOn: new Date().toISOString().slice(0, 10),
  mock: sources.mode === "mock",
});
writeFileSync("eval/dedupe-report.md", report);
console.log(report);
