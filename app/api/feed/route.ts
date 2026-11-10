import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { getFeed } from "@/lib/data/feed";
import { type CourseCache, buildCourseGraph } from "@/lib/nebula";
import { getSources } from "@/lib/sources";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** The signed-in student's ranked Scouting Report. */
export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { data: profile } = await auth.supabase
    .from("users")
    .select("major,class_year,interests,courses,onboarded")
    .eq("id", auth.user.id)
    .maybeSingle();
  const sources = getSources();
  const courses = profile?.courses ?? [];
  try {
    const feed = await getFeed(
      auth.supabase,
      profile ?? { major: null, class_year: null, interests: [], courses: [] },
      {
        cursor: new URL(request.url).searchParams.get("cursor") ?? undefined,
        enrich: {
          embed: (text) => sources.embedder.embed(text),
          courseGraph: () =>
            buildCourseGraph(courses, { source: sources.nebula, cache: nebulaCache() }),
        },
      },
    );
    return NextResponse.json(
      { ...feed, needs_onboarding: profile ? !profile.onboarded : false },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

/** Course lookups are cached in nebula_cache (service-only table), so go through the service-role client. */
function nebulaCache(): CourseCache | null {
  try {
    const db = createSupabaseAdminClient();
    return {
      async get(key) {
        const { data } = await db
          .from("nebula_cache")
          .select("payload,fetched_at")
          .eq("key", key)
          .maybeSingle();
        return data ?? null;
      },
      async set(key, payload) {
        await db
          .from("nebula_cache")
          .upsert({ key, payload: payload as never, fetched_at: new Date().toISOString() });
      },
    };
  } catch {
    return null; // service key not configured: skip the cache, still resolve live
  }
}
