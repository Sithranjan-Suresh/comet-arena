import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/api";
import { uuidSchema } from "@/lib/saves";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Mark a flag resolved (the admin fixed the listing or decided the flag was wrong). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data, error } = await createSupabaseAdminClient()
    .from("flags")
    .update({ resolved: true })
    .eq("id", id.data)
    .select("id");
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!data?.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ resolved: true });
}
