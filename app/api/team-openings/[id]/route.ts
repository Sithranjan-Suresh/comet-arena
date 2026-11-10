import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { REASON_MESSAGE, REASON_STATUS, patchTeamOpening } from "@/lib/free-agency";
import { uuidSchema } from "@/lib/saves";
import { teamOpeningPatchSchema } from "@/lib/schemas";

/** Edit or close your own team opening. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).id);
  const parsed = teamOpeningPatchSchema.safeParse(await request.json().catch(() => null));
  if (!id.success)
    return NextResponse.json(
      { error: "not_found", message: REASON_MESSAGE.not_found },
      { status: 404 },
    );
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const r = await patchTeamOpening(auth.supabase, auth.user.id, id.data, parsed.data);
  return r.ok
    ? NextResponse.json(r.post)
    : NextResponse.json(
        { error: r.reason, message: REASON_MESSAGE[r.reason] },
        { status: REASON_STATUS[r.reason] },
      );
}
