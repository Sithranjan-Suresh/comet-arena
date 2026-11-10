import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import { subscriptionSchema } from "@/lib/notify/push";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Opt in to browser notifications on this device. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const sub = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!sub.success)
    return NextResponse.json(
      { error: "invalid_input", message: "That is not a valid push subscription." },
      { status: 400 },
    );

  // The same browser can be signed in as someone else later, so the endpoint moves to the current user.
  // RLS would block taking over a row, so this one write uses the service role after authenticating the caller.
  const { error } = await createSupabaseAdminClient().from("push_subscriptions").upsert(
    {
      user_id: auth.user.id,
      endpoint: sub.data.endpoint,
      p256dh: sub.data.keys.p256dh,
      auth: sub.data.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error)
    return NextResponse.json(
      { error: "unavailable", message: "Something went wrong. Try again." },
      { status: 503 },
    );
  return NextResponse.json({ subscribed: true }, { status: 201 });
}

/** Opt out on this device. */
export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const body = z
    .object({ endpoint: z.string().url().max(1000) })
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { error } = await auth.supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("endpoint", body.data.endpoint);
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ subscribed: false });
}
