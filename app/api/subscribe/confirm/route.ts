import { NextResponse, type NextRequest } from "next/server";
import { confirmSubscription } from "@/lib/subscribe";
import { supabaseSubscribeStore } from "@/lib/subscribe-store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Confirm a subscription. POST only: the confirm page's button submits here, so link prefetchers and
 * mail-security scanners (which only GET) cannot confirm on someone's behalf.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("t") ?? request.nextUrl.searchParams.get("t") ?? "");
  const back = (q: string) =>
    NextResponse.redirect(new URL(`/subscribe/confirm?${q}`, request.url), 303);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return back("error=2");
  try {
    const ok = await confirmSubscription(token, {
      store: supabaseSubscribeStore(createSupabaseAdminClient()),
    });
    return ok ? back("done=1") : back("error=1");
  } catch {
    return back("error=2");
  }
}
