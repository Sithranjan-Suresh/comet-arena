import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { type ClaimState, type ClaimStatus, claimInputSchema } from "@/lib/orgs/claims";
import { uuidSchema } from "@/lib/saves";

const notFound = () =>
  NextResponse.json(
    { error: "not_found", message: "We could not find that organization." },
    { status: 404 },
  );

/** Where this student stands on claiming the org: none, pending, approved or rejected. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success) return notFound();

  const [{ data: org, error: e1 }, { data: mine, error: e2 }] = await Promise.all([
    auth.supabase.from("orgs").select("claimed_by").eq("id", id.data).maybeSingle(),
    auth.supabase
      .from("org_claims")
      .select("status,created_at")
      .eq("org_id", id.data)
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (e1 || e2) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!org) return notFound();
  const status = (mine?.[0]?.status ?? "none") as ClaimStatus;
  const state: ClaimState = {
    status: org.claimed_by === auth.user.id ? "approved" : status,
    claimed: !!org.claimed_by,
  };
  return NextResponse.json(state, { headers: { "cache-control": "private, no-store" } });
}

/** Ask to run this organization's Front Office. An admin decides. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success) return notFound();
  const body = claimInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return NextResponse.json(
      { error: "invalid_input", message: "Keep the note under 300 characters." },
      { status: 400 },
    );

  const { data: org, error: lookup } = await auth.supabase
    .from("orgs")
    .select("claimed_by")
    .eq("id", id.data)
    .maybeSingle();
  if (lookup) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!org) return notFound();
  if (org.claimed_by)
    return NextResponse.json(
      {
        error: "already_claimed",
        message: "Officers already run this organization. Ask them to add you.",
      },
      { status: 409 },
    );

  const { error } = await auth.supabase
    .from("org_claims")
    .insert({ org_id: id.data, user_id: auth.user.id, note: body.data.note });
  if (!error) return NextResponse.json({ status: "pending" }, { status: 201 });
  if (error.code === "23505") return NextResponse.json({ status: "pending", already: true });
  return NextResponse.json(
    { error: "unavailable", message: "Something went wrong. Try again." },
    { status: 503 },
  );
}
