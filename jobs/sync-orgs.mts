// Weekly job (Sun 2 AM CT): refresh the org directory from UTD Clubs.
//   npm run job:sync-orgs
import { runOrgSync } from "../lib/orgs/sync-job";
import { supabaseOrgStore } from "../lib/orgs/supabase-store";
import { getSources } from "../lib/sources";
import { runCli } from "./lib/run";

await runCli("sync-orgs", async (_ctx, db) => {
  const result = await runOrgSync({
    fetchClubs: () => getSources().utdclubs.fetchClubs(),
    store: supabaseOrgStore(db),
    cache: {
      async save(key, payload) {
        const { error } = await db
          .from("nebula_cache")
          .upsert({ key, payload: payload as never, fetched_at: new Date().toISOString() });
        if (error) throw error;
      },
    },
  });
  return { ...result };
});
