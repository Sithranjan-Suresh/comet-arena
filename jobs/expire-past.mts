// Daily job: mark finished competitions as past and close Free Agency posts after registration.
//   npm run job:expire-past
import { runCli } from "./lib/run";

await runCli("expire-past", async (_ctx, db) => {
  const { data, error } = await db.rpc("expire_past");
  if (error) throw error;
  return { result: data };
});
