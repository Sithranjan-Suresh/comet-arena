// @ts-check
// Regenerates .github/workflows/job-*.yml from scripts/lib/schedule.mjs.
//   node scripts/gen-workflows.mjs          write
//   node scripts/gen-workflows.mjs --check  fail if the committed files are stale
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { JOBS, renderWorkflow } from "./lib/schedule.mjs";

const check = process.argv.includes("--check");
mkdirSync(".github/workflows", { recursive: true });
let stale = 0;
for (const job of JOBS) {
  const file = `.github/workflows/job-${job.name}.yml`;
  const next = renderWorkflow(job);
  if (check) {
    if (!existsSync(file) || readFileSync(file, "utf8") !== next) {
      console.error(`stale: ${file}`);
      stale++;
    }
  } else writeFileSync(file, next);
}
if (check && stale) process.exit(1);
console.log(check ? "workflows up to date" : `wrote ${JOBS.length} workflows`);
