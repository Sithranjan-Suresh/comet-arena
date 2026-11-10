import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { listEntries } from "@/lib/entries";

/** Your private competition history. */
export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const entries = await listEntries(auth.supabase, auth.user.id);
  if (!entries) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ entries }, { headers: { "cache-control": "private, no-store" } });
}
