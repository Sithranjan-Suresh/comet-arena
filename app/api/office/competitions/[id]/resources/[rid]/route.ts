import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { officerErrorStatus } from "@/lib/office";
import { uuidSchema } from "@/lib/saves";

/** Remove one of the caller's organization's prep resources. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; rid: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const rid = uuidSchema.safeParse((await ctx.params).rid);
  if (!rid.success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data, error } = await auth.supabase.rpc("officer_remove_resource", {
    p_resource: rid.data,
  });
  if (error) {
    const e = officerErrorStatus(error.code);
    return NextResponse.json({ error: e.error, message: e.message }, { status: e.status });
  }
  if (data !== true) return NextResponse.json({ error: "not_found" }, { status: 404 });
  revalidateTag("competitions");
  return NextResponse.json({ removed: true });
}
