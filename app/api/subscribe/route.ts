import { NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { getSources } from "@/lib/sources";
import { startSubscription } from "@/lib/subscribe";
import { supabaseSubscribeStore } from "@/lib/subscribe-store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const perIp = createRateLimiter({ windowMs: 60 * 60_000, max: 8 });
const perEmail = createRateLimiter({ windowMs: 60 * 60_000, max: 3 });

/** Same answer for every outcome: the form must not reveal who is subscribed. */
const OK = () => NextResponse.json({ ok: true });

/** Comet Arena Weekly signup (double opt-in): sends a confirmation email, subscribes nothing until clicked. */
export async function POST(request: Request) {
  if (!perIp.allow(clientIp(request.headers))) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": "3600" } },
    );
  }
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email && !perEmail.allow(email)) return OK(); // silently throttle repeats for one address

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  try {
    await startSubscription(body, {
      store: supabaseSubscribeStore(createSupabaseAdminClient()),
      mailer: getSources().mailer,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    });
    return OK();
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
