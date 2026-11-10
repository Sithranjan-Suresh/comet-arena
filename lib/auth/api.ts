import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ApiAuth =
  | { ok: true; user: User; supabase: SupabaseClient<Database> }
  | { ok: false; response: NextResponse };

const unauthorized = () =>
  NextResponse.json(
    { error: "unauthorized", message: "Sign in with your @utdallas.edu account." },
    { status: 401 },
  );

/** For route handlers: returns the user and an RLS-bound client, or a ready 401 response. */
export async function requireApiUser(): Promise<ApiAuth> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { ok: false, response: unauthorized() };
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, response: unauthorized() };
  return { ok: true, user: data.user, supabase };
}

/** Same, plus admin check (403 for signed-in non-admins). */
export async function requireApiAdmin(): Promise<ApiAuth> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth;
  const { data } = await auth.supabase
    .from("users")
    .select("is_admin")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!data?.is_admin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return auth;
}
