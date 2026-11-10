// Daily job: mark finished competitions as past and close Free Agency posts after registration.
//   npm run job:expire-past
import { createJobClient } from "./lib/db";

const { data, error } = await createJobClient().rpc("expire_past");
if (error) throw error;
console.log(JSON.stringify({ job: "expire-past", result: data }));
