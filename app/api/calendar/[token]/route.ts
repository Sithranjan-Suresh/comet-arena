import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { buildUserFeed, tokenFromSegment } from "@/lib/calendar-feed";
import { supabaseFeedDeps } from "@/lib/data/ics-feed";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const notFound = () => new NextResponse("Not found", { status: 404 });

/** Cached per user for 10 minutes; saves/unsaves call revalidateTag(`ics-user-<id>`) to refresh early. */
function cachedFeed(userId: string, segment: string, appUrl: string) {
  return unstable_cache(
    async () => {
      const deps = supabaseFeedDeps(createSupabaseAdminClient());
      // The user is already resolved, so skip the token lookup inside the cached work.
      return buildUserFeed(segment, { ...deps, findUserIdByToken: async () => userId, appUrl });
    },
    ["ics-feed", userId],
    { revalidate: 600, tags: [`ics-user-${userId}`] },
  )();
}

/**
 * Personal calendar feed: /api/calendar/<token>.ics. The secret token is the only credential
 * (calendar apps cannot send cookies), so unknown and malformed tokens look identical.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token: segment } = await ctx.params;
  if (!tokenFromSegment(segment)) return notFound();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
    return new NextResponse("Unavailable", { status: 503 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const deps = supabaseFeedDeps(createSupabaseAdminClient());
    const userId = await deps.findUserIdByToken(tokenFromSegment(segment)!);
    if (!userId) return notFound();

    const result = await cachedFeed(userId, segment, appUrl);
    if (result.status !== 200)
      return result.status === 404 ? notFound() : new NextResponse("Unavailable", { status: 503 });
    return new NextResponse(result.body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="comet-arena.ics"',
        // The URL is a secret: never let shared caches keep it. Clients poll on their own schedule.
        "cache-control": "private, max-age=300",
        "x-robots-tag": "noindex",
      },
    });
  } catch {
    return new NextResponse("Unavailable", { status: 503 });
  }
}
