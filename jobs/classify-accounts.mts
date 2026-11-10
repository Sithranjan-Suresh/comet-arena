// Weekly job: re-test personal_or_missing Instagram handles with Business Discovery.
//   npm run job:classify-accounts
import { runClassifyAccounts } from "../lib/jobs/classify-accounts";
import { getSources } from "../lib/sources";
import { runCli } from "./lib/run";

await runCli("classify-accounts", async (ctx, db) => {
  const summary = await runClassifyAccounts({
    instagram: getSources().instagram,
    log: ctx.log,
    store: {
      async listPersonal() {
        const { data, error } = await db
          .from("orgs")
          .select("id,name,ig_handle,ig_account_type")
          .eq("ig_account_type", "personal_or_missing")
          .not("ig_handle", "is", null)
          .order("id");
        if (error) throw error;
        return (data ?? []) as never;
      },
      async setAccountType(orgId, type) {
        const { error } = await db.from("orgs").update({ ig_account_type: type }).eq("id", orgId);
        if (error) throw error;
      },
    },
  });
  return { ...summary, incomplete: false };
});
