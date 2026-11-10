import { NextResponse } from "next/server";
import { handleEditSchema, normalizeHandle } from "@/lib/admin/org-handles";
import { supabaseHandleStore } from "@/lib/admin/org-handles-server";
import { requireApiAdmin } from "@/lib/auth/api";
import { uuidSchema } from "@/lib/saves";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Set or clear one org's Instagram handle (and account type). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = handleEditSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "invalid_input", message: "Send ig_handle (or null)." },
      { status: 422 },
    );

  const raw = body.data.ig_handle;
  const handle = raw === null || raw === "" ? null : normalizeHandle(raw);
  if (raw && !handle)
    return NextResponse.json(
      { error: "invalid_input", message: "That is not a valid Instagram handle." },
      { status: 422 },
    );

  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("orgs").select("id").eq("id", id.data).maybeSingle();
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await supabaseHandleStore(db).setHandle(
      id.data,
      handle,
      body.data.ig_account_type ?? "unknown",
    );
    return NextResponse.json({ ig_handle: handle });
  } catch {
    return NextResponse.json(
      { error: "unavailable", message: "Something went wrong. Try again." },
      { status: 503 },
    );
  }
}
