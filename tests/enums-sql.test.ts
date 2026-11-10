import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPETITION_STATUSES,
  COSTS,
  ENTRY_RESULTS,
  FORMATS,
  IG_ACCOUNT_TYPES,
  INGEST_CLASSES,
  POST_STATUSES,
  QUEUE_KINDS,
  QUEUE_STATUSES,
  SOURCE_TYPES,
  SUBMISSION_STATUSES,
  TIERS,
  WARNING_WINDOWS,
} from "@/lib/schemas/enums";

const dir = path.resolve(import.meta.dirname, "../supabase/migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(path.join(dir, f), "utf8"))
  .join("\n");

/** Parse `create type public.<name> as enum (...)` into name -> values. */
function sqlEnums(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /create type public\.(\w+) as enum \(([^)]*)\)/g;
  for (const m of sql.matchAll(re)) {
    out[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }
  return out;
}

describe("SQL enums mirror lib/schemas/enums.ts", () => {
  const e = sqlEnums();
  const cases: [string, readonly string[]][] = [
    ["ig_account_type", IG_ACCOUNT_TYPES],
    ["competition_tier", TIERS],
    ["competition_cost", COSTS],
    ["competition_format", FORMATS],
    ["competition_status", COMPETITION_STATUSES],
    ["source_type", SOURCE_TYPES],
    ["queue_kind", QUEUE_KINDS],
    ["queue_status", QUEUE_STATUSES],
    ["submission_status", SUBMISSION_STATUSES],
    ["ingest_class", INGEST_CLASSES],
    ["post_status", POST_STATUSES],
    ["entry_result", ENTRY_RESULTS],
    ["warning_window", WARNING_WINDOWS],
  ];
  it.each(cases)("%s", (name, values) => {
    expect(e[name]).toEqual([...values]);
  });
});
