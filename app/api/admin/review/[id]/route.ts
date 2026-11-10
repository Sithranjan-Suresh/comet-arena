import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { createReviewDeps } from "@/lib/admin/review-server";
import { resolveReviewItem } from "@/lib/admin/review";
import { requireApiAdmin } from "@/lib/auth/api";
import { uuidSchema } from "@/lib/saves";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Resolve one review item: approve, edit, merge or reject. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success)
    return NextResponse.json(
      { error: "not_found", message: "That review item does not exist." },
      { status: 404 },
    );

  try {
    const result = await resolveReviewItem(
      id.data,
      await request.json().catch(() => null),
      createReviewDeps(createSupabaseAdminClient()),
    );
    if (result.status === 200) revalidateTag("competitions");
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { error: "unavailable", message: "Something went wrong. Try again." },
      { status: 503 },
    );
  }
}
