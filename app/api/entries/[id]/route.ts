import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import { deleteEntry, patchEntry } from "@/lib/entries";
import { uuidSchema } from "@/lib/saves";
import { entryResultSchema } from "@/lib/schemas";

const patchSchema = z.object({
  team_name: z.string().max(80).optional(),
  result: entryResultSchema.optional(),
  rounds_advanced: z.number().int().min(0).max(20).optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const r = await patchEntry(auth.supabase, auth.user.id, id.data, parsed.data);
  return r.ok
    ? NextResponse.json(r.entry)
    : NextResponse.json({ error: r.reason }, { status: r.reason === "not_found" ? 404 : 500 });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const r = await deleteEntry(auth.supabase, auth.user.id, id.data);
  return r.ok
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: r.reason }, { status: r.reason === "not_found" ? 404 : 500 });
}
