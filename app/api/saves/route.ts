import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { listSavedIds, saveCompetition, saveInputSchema } from "@/lib/saves";

/** The current user's saved competition ids. */
export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const ids = await listSavedIds(auth.supabase, auth.user.id);
  if (!ids) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json(
    { competition_ids: ids },
    { headers: { "cache-control": "private, no-store" } },
  );
}

/** Save a competition. Idempotent. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = saveInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const result = await saveCompetition(auth.supabase, auth.user.id, parsed.data.competition_id);
  if (result.ok) {
    revalidateTag(`ics-user-${auth.user.id}`); // refresh the cached calendar feed
    return NextResponse.json({ saved: true });
  }
  return NextResponse.json(
    { error: result.reason },
    { status: result.reason === "not_found" ? 404 : 500 },
  );
}
