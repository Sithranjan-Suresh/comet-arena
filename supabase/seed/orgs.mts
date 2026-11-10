// Seeds `orgs` from a UTD Clubs snapshot. Idempotent; never overwrites manual handles.
//   npm run seed:orgs                       (uses fixtures/utdclubs-snapshot.json)
//   npm run seed:orgs -- path/to/snapshot.json
import { readFileSync } from "node:fs";
import { createJobClient } from "../../jobs/lib/db";
import { snapshotSchema } from "../../lib/orgs/merge";
import { supabaseOrgStore } from "../../lib/orgs/supabase-store";
import { syncOrgs } from "../../lib/orgs/sync";

const file =
  process.argv[2] ?? new URL("../../fixtures/utdclubs-snapshot.json", import.meta.url).pathname;
const snapshot = snapshotSchema.parse(JSON.parse(readFileSync(file, "utf8")));
const result = await syncOrgs(supabaseOrgStore(createJobClient()), snapshot.clubs);
console.log(`orgs seeded from ${file}:`, result);
