import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { getSchedule } from "@/lib/data/schedule";

/** Saved stages grouped by week. */
export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  try {
    const schedule = await getSchedule(auth.supabase, auth.user.id);
    return NextResponse.json(schedule, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
