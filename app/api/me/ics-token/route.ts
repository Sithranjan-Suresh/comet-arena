import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { generateIcsToken } from "@/lib/ics-token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Rotate the personal calendar-feed token (invalidates any old subscribed URL).
 * Uses the service role because clients cannot write `ics_token` (column grants), then returns the new token.
 */
export async function POST() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const token = generateIcsToken();
  const { error } = await createSupabaseAdminClient()
    .from("users")
    .update({ ics_token: token })
    .eq("id", auth.user.id);
  if (error) return NextResponse.json({ error: "rotate_failed" }, { status: 500 });
  return NextResponse.json({ ics_token: token });
}
