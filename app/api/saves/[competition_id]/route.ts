import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { unsaveCompetition, uuidSchema } from "@/lib/saves";

/** Unsave a competition. Idempotent. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ competition_id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = uuidSchema.safeParse((await ctx.params).competition_id);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const result = await unsaveCompetition(auth.supabase, auth.user.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 500 });
  revalidateTag(`ics-user-${auth.user.id}`); // refresh the cached calendar feed
  return NextResponse.json({ saved: false });
}
