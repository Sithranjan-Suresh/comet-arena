import "server-only";
import type { User } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loginPathFor } from "./routes";

/** Current user from the validated session, or null. Safe to call when Supabase is not configured. */
export async function getUser(): Promise<User | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

/** For pages: redirect to login (returning to `returnTo`) when signed out. */
export async function requireUser(returnTo = "/"): Promise<User> {
  const user = await getUser();
  if (!user) redirect(loginPathFor(returnTo));
  return user;
}

/** For admin pages: signed-in AND users.is_admin. Anyone else gets a 404 (do not reveal /admin exists). */
export async function requireAdmin(returnTo = "/admin"): Promise<User> {
  const user = await requireUser(returnTo);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("users").select("is_admin").eq("id", user.id).maybeSingle();
  if (!data?.is_admin) notFound();
  return user;
}
