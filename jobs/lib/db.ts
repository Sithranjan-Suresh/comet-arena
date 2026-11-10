import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";

/**
 * Service-role client for scripts and scheduled jobs (runs outside Next.js, so it reads
 * process.env directly and does not use `server-only`). Run scripts with
 * `tsx --env-file=.env.local <script>`.
 */
export function createJobClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required (see .env.example).",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
