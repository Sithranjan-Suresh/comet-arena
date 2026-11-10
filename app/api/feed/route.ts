import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { getFeed } from "@/lib/data/feed";

/** The signed-in student's ranked Scouting Report. */
export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { data: profile } = await auth.supabase
    .from("users")
    .select("major,class_year,interests,courses")
    .eq("id", auth.user.id)
    .maybeSingle();
  try {
    const feed = await getFeed(
      auth.supabase,
      profile ?? { major: null, class_year: null, interests: [], courses: [] },
      { cursor: new URL(request.url).searchParams.get("cursor") ?? undefined },
    );
    return NextResponse.json(feed, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
