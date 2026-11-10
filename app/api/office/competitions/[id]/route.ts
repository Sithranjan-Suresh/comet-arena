import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { officerEditSchema, officerErrorStatus } from "@/lib/office";
import { uuidSchema } from "@/lib/saves";

/** Officer edits to one of their organization's listings. Claimed listings become verified (live). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success)
    return NextResponse.json(
      { error: "not_found", message: "We could not find that competition." },
      { status: 404 },
    );
  const raw = await request.json().catch(() => null);
  const body = officerEditSchema.safeParse(raw);
  if (!body.success)
    return NextResponse.json(
      { error: "invalid_input", message: body.error.issues[0]?.message ?? "Check the fields." },
      { status: 400 },
    );

  const { stages, ...fields } = body.data;
  let status: string | null = null;
  let datesChanged = false;
  if (Object.keys(fields).length > 0) {
    const { data, error } = await auth.supabase.rpc("officer_update_competition", {
      p_id: id.data,
      p_patch: fields as never,
    });
    if (error) {
      const e = officerErrorStatus(error.code);
      return NextResponse.json({ error: e.error, message: e.message }, { status: e.status });
    }
    status = String(data);
  }
  if (stages) {
    const { data, error } = await auth.supabase.rpc("officer_set_stages", {
      p_id: id.data,
      p_stages: stages as never,
    });
    if (error) {
      const e = officerErrorStatus(error.code);
      return NextResponse.json({ error: e.error, message: e.message }, { status: e.status });
    }
    datesChanged = data === true;
  }
  revalidateTag("competitions");
  return NextResponse.json({ status, dates_changed: datesChanged });
}
