import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { REASON_MESSAGE, REASON_STATUS, upsertFreeAgent } from "@/lib/free-agency";
import { freeAgentPostSchema } from "@/lib/schemas";

/** Post (or re-open) yourself as a free agent for a competition. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const parsed = freeAgentPostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  const r = await upsertFreeAgent(auth.supabase, auth.user.id, parsed.data);
  return r.ok
    ? NextResponse.json(r.post, { status: 201 })
    : NextResponse.json(
        { error: r.reason, message: REASON_MESSAGE[r.reason] },
        { status: REASON_STATUS[r.reason] },
      );
}
