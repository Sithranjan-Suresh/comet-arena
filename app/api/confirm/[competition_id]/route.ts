import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { type ConfirmResponse, confirmErrorStatus } from "@/lib/flags";
import { uuidSchema } from "@/lib/saves";

/** "This looks right": one confirmation per student; the third makes an unverified listing live. */
export async function POST(_req: Request, ctx: { params: Promise<{ competition_id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).competition_id);
  if (!id.success)
    return NextResponse.json(
      { error: "not_found", message: "We could not find that competition." },
      { status: 404 },
    );

  const { data, error } = await auth.supabase.rpc("confirm_competition", { p_id: id.data });
  if (error) {
    const e = confirmErrorStatus(error.code);
    return NextResponse.json({ error: e.error, message: e.message }, { status: e.status });
  }
  const row = (Array.isArray(data) ? data[0] : data) as ConfirmResponse | undefined;
  if (!row) return NextResponse.json({ error: "unavailable" }, { status: 500 });
  if (!row.already) revalidateTag("competitions"); // the badge and count change on Game Day
  return NextResponse.json(row);
}
