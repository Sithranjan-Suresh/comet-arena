import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Delete the account and all of the user's data. Deleting the auth user cascades (FK ON DELETE CASCADE)
 * through public.users to saves, entries, free-agent posts, openings, flags and submissions.
 * The client must send { confirm: "DELETE" }.
 */
export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== "DELETE") {
    return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  }

  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(auth.user.id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  await auth.supabase.auth.signOut();
  return NextResponse.json({ deleted: true });
}
