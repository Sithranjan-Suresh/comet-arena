import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { upsertEntry } from "@/lib/entries";
import { entryInputSchema } from "@/lib/schemas";

/** Record or update your own result for a competition (private; shown on your Player Card). */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const parsed = entryInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  const r = await upsertEntry(auth.supabase, auth.user.id, parsed.data);
  if (r.ok) return NextResponse.json(r.entry, { status: 201 });
  return NextResponse.json({ error: r.reason }, { status: r.reason === "not_found" ? 404 : 500 });
}
