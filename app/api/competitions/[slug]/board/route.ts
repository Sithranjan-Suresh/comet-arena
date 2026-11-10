import { NextResponse } from "next/server";
import { getBoard } from "@/lib/board";
import { SLUG_PATTERN } from "@/lib/data/game-day";
import { roleSchema } from "@/lib/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The Free Agency board for one competition. Public; contact emails appear only for signed-in viewers. */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!SLUG_PATTERN.test(slug) || slug.length > 120)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const roleParam = new URL(request.url).searchParams.get("role");
  const role = roleParam ? roleSchema.safeParse(roleParam) : null;
  if (role && !role.success) return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
    return NextResponse.json({ error: "unavailable" }, { status: 503 });

  try {
    const board = await getBoard(await createSupabaseServerClient(), slug, role?.data);
    if (!board) return NextResponse.json({ error: "not_found" }, { status: 404 });
    // Viewer-specific (emails, "is mine"), so never share a cached copy between users.
    return NextResponse.json(board, {
      headers: { "cache-control": "private, no-cache", vary: "Cookie" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
