// Writes eval/cases.jsonl from the 20 fixture flyers so the eval harness runs end to end in mock mode.
// Real evaluation uses hand-labeled posts (see eval/README.md); replace the file with those.
//   npm run eval:seed
import { writeFileSync } from "node:fs";
import { loadFlyerCases } from "../lib/fixtures";
import type { EvalCase } from "../lib/eval/schema";

const lines = loadFlyerCases().map((c): EvalCase => {
  const ex = c.expected;
  const first = [...ex.stages].sort((a, b) => a.deadline_at.localeCompare(b.deadline_at))[0];
  return {
    id: c.id,
    source_url: null,
    org: c.org_slug,
    posted_at: c.posted_at,
    caption: c.caption,
    images: c.images.map((f) => `fixtures/flyers/${f}`),
    label: {
      kind: ex.kind,
      title: ex.kind === "not_competition" ? null : ex.title,
      host: ex.host,
      categories: ex.categories,
      first_deadline: ex.kind === "competition" ? (first?.deadline_at ?? null) : null,
      register_url: ex.kind === "competition" ? ex.register_url : null,
    },
    notes: c.note,
  };
});
writeFileSync("eval/cases.jsonl", lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
console.log(`wrote ${lines.length} cases to eval/cases.jsonl`);
