import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "./database.types";

let admin: ReturnType<typeof createClient<Database>> | undefined;

/**
 * Service-role client. BYPASSES Row-Level Security: use only in jobs, ingestion and API routes
 * that must act as the system, and always authorize the caller first. Never import in client code
 * (the `server-only` import makes the build fail if you do).
 */
export function createSupabaseAdminClient() {
  admin ??= createClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return admin;
}
