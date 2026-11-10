import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { officerErrorStatus, resourceInputSchema } from "@/lib/office";
import { uuidSchema } from "@/lib/saves";

/** Add a prep resource (a link) to a competition the caller's organization hosts. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success)
    return NextResponse.json(
      { error: "not_found", message: "We could not find that competition." },
      { status: 404 },
    );
  const body = resourceInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "invalid_input", message: "Add a short label and a full https:// link." },
      { status: 400 },
    );

  const { data, error } = await auth.supabase.rpc("officer_add_resource", {
    p_id: id.data,
    p_label: body.data.label,
    p_url: body.data.url,
  });
  if (error) {
    const e = officerErrorStatus(error.code);
    return NextResponse.json({ error: e.error, message: e.message }, { status: e.status });
  }
  revalidateTag("competitions");
  return NextResponse.json({ id: data }, { status: 201 });
}
