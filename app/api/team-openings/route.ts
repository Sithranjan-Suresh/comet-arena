import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { REASON_MESSAGE, REASON_STATUS, createTeamOpening } from "@/lib/free-agency";
import { teamOpeningPostSchema } from "@/lib/schemas";

/** Post a team opening (the roles your team still needs). */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const parsed = teamOpeningPostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  const r = await createTeamOpening(auth.supabase, auth.user.id, parsed.data);
  return r.ok
    ? NextResponse.json(r.post, { status: 201 })
    : NextResponse.json(
        { error: r.reason, message: REASON_MESSAGE[r.reason] },
        { status: REASON_STATUS[r.reason] },
      );
}
