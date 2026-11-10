import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { confirmSubmission } from "@/lib/submit/confirm";
import { createConfirmDeps } from "@/lib/submit/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { uuidSchema } from "@/lib/saves";

/** Publish (or merge) what the student reviewed in Report a Game. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success)
    return NextResponse.json(
      { error: "not_found", message: "We could not find that submission." },
      { status: 404 },
    );

  const body = await request.json().catch(() => null);
  try {
    const result = await confirmSubmission(
      id.data,
      auth.user.id,
      body,
      createConfirmDeps(auth.supabase, createSupabaseAdminClient()),
    );
    if (result.status === 200) revalidateTag("competitions"); // The Field and Game Day pick the new listing up now
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { error: "unavailable", message: "Something went wrong. Please try again." },
      { status: 503 },
    );
  }
}
