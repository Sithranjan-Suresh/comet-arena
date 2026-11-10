// Fails (exit 1) when the last `npm run eval` regressed against eval/baseline.json, or (with --absolute)
// when any metric is under the spec minimums. CI runs this on the mock set; run it with --absolute after a
// live eval before switching ingestion on.
//   npm run eval && npm run eval:gate
//   SOURCES_MODE=live npm run eval && npm run eval:gate -- --absolute
//   npm run eval:gate -- --update-baseline   (accept the current numbers as the new baseline)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { checkGate } from "../lib/eval/gate";

const results = JSON.parse(readFileSync("eval/results.json", "utf8")) as {
  mode: string;
  image: { gate: Record<string, number | null> };
};
const current = results.image.gate;

if (process.argv.includes("--update-baseline")) {
  writeFileSync(
    "eval/baseline.json",
    JSON.stringify({ mode: results.mode, gate: current }, null, 2) + "\n",
  );
  console.log("Baseline updated.");
  process.exit(0);
}

const baselineFile = existsSync("eval/baseline.json")
  ? (JSON.parse(readFileSync("eval/baseline.json", "utf8")) as {
      mode: string;
      gate: Record<string, number | null>;
    })
  : null;
// A baseline from the mock model says nothing about a live run (and vice versa): compare like with like.
const baseline = baselineFile && baselineFile.mode === results.mode ? baselineFile.gate : null;
const outcome = checkGate({ current, baseline, absolute: process.argv.includes("--absolute") });

if (outcome.ok) console.log(`Eval gate passed (${results.mode}).`);
else {
  console.error("Eval gate FAILED:");
  for (const f of outcome.failures) console.error(` - ${f}`);
  process.exit(1);
}
