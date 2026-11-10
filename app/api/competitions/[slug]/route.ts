import { NextResponse } from "next/server";
import { getGameDay, SLUG_PATTERN } from "@/lib/data/game-day";
import { evaluateEligibility } from "@/lib/eligibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Game Day data. Public fields come from the database under RLS; `viewer_saved` and
 * `viewer_eligible` are filled only for a signed-in user (null / false otherwise).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
    return NextResponse.json({ error: "unavailable" }, { status: 503 });

  try {
    const supabase = await createSupabaseServerClient();
    const dto = await getGameDay(supabase, slug);
    if (!dto) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      const [{ data: save }, { data: profile }] = await Promise.all([
        supabase.from("saves").select("competition_id").eq("competition_id", dto.id).maybeSingle(),
        supabase
          .from("users")
          .select("major,class_year,courses")
          .eq("id", auth.user.id)
          .maybeSingle(),
      ]);
      dto.viewer_saved = !!save;
      dto.viewer_eligible = profile ? evaluateEligibility(dto.eligibility, profile) : "unknown";
    }
    // Viewer-specific, so never share a cached copy between users.
    return NextResponse.json(dto, {
      headers: { "cache-control": "private, no-cache", vary: "Cookie" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
