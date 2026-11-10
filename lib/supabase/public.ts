import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Cookie-free anon client for public, cacheable reads (The Field, Game Day, ticker). Because it
 * never touches request cookies, pages that use it can be statically rendered / ISR-cached.
 * Returns null when Supabase is not configured so public pages can degrade instead of crashing.
 */
export function createSupabasePublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
