import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/api";
import { claimDecisionSchema, decisionResponse } from "@/lib/orgs/claims";
import { uuidSchema } from "@/lib/saves";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Approve or reject an officer's claim. Approval sets the org's claimed_by and marks it verified. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = claimDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "invalid_input", message: "Send { approve: true | false }." },
      { status: 400 },
    );

  const { data, error } = await createSupabaseAdminClient().rpc("decide_org_claim", {
    p_claim: id.data,
    p_approve: body.data.approve,
    p_admin: auth.user.id,
  });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const out = decisionResponse(String(data));
  if (out.status === 200) revalidateTag("competitions"); // the org page shows its Claimed badge
  return NextResponse.json(out.body, { status: out.status });
}
