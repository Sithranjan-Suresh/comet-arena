// Verifies a deployed database and environment against the launch criteria.
//   npm run verify:launch               reads .env.local (or the shell environment)
//   npm run verify:launch -- --env-only checks only the environment variables
// Exit code 1 when any criterion fails, so it can gate a launch checklist or a workflow.
import { createClient } from "@supabase/supabase-js";
import { evaluateLaunchCounts, missingEnv, summarize } from "../lib/launch/checks";

const envOnly = process.argv.includes("--env-only");
const lines: string[] = [];
let failed = false;
const report = (ok: boolean, label: string, detail = "") => {
  if (!ok) failed = true;
  lines.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const missing = missingEnv(process.env);
report(
  missing.length === 0,
  "Required environment is set",
  missing.length ? `missing: ${missing.join(", ")}` : "",
);
report(
  process.env.SOURCES_MODE === "live",
  "SOURCES_MODE=live",
  `is "${process.env.SOURCES_MODE ?? "unset"}"`,
);

if (!envOnly) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !service || !anon) report(false, "Database reachable", "Supabase URL/keys missing");
  else {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const pub = createClient(url, anon, { auth: { persistSession: false } });

    const { data: rows, error } = await admin
      .from("competitions")
      .select("status,categories,competition_sources(id),stages(id)");
    report(!error, "Competitions readable with the service key", error?.message ?? "");
    if (!error) {
      const results = evaluateLaunchCounts(
        (rows ?? []).map((r) => ({
          status: r.status,
          categories: r.categories ?? [],
          source_count: Array.isArray(r.competition_sources) ? r.competition_sources.length : 0,
          has_stages: Array.isArray(r.stages) && r.stages.length > 0,
        })),
      );
      for (const r of results) report(r.ok, r.label, r.detail);
      summarize(results);
    }

    // Row-level security: visitors read the public catalog and nothing personal.
    const anonComps = await pub.from("competition_cards").select("id").limit(1);
    report(
      !anonComps.error && (anonComps.data?.length ?? 0) > 0,
      "Visitors can read The Field",
      anonComps.error?.message ?? "",
    );
    const anonUsers = await pub.from("users").select("email").limit(1);
    report(
      !!anonUsers.error || (anonUsers.data?.length ?? 0) === 0,
      "Visitors cannot read user emails",
    );
    const anonSubs = await pub.from("email_subscribers").select("email").limit(1);
    report(
      !!anonSubs.error || (anonSubs.data?.length ?? 0) === 0,
      "Visitors cannot read subscribers",
    );

    const { data: buckets } = await admin.storage.listBuckets();
    report(
      !!buckets?.some((b) => b.name === "flyers" && b.public),
      "Public 'flyers' storage bucket exists",
    );

    const orgs = await admin.from("orgs").select("id", { count: "exact", head: true });
    report(
      (orgs.count ?? 0) >= 100,
      "Org directory loaded (sync-orgs has run)",
      `${orgs.count ?? 0} orgs`,
    );
    const handles = await admin
      .from("orgs")
      .select("id", { count: "exact", head: true })
      .not("ig_handle", "is", null);
    report(
      (handles.count ?? 0) >= 47,
      "At least 47 orgs have an Instagram handle",
      `${handles.count ?? 0} with handles`,
    );
  }
}

console.log(lines.join("\n"));
if (failed) {
  console.error("\nNot launch-ready. Fix the FAIL lines above.");
  process.exit(1);
}
console.log("\nAll launch criteria met.");
