import { NextResponse, type NextRequest } from "next/server";
import { applyUnsubscribe } from "@/lib/data/unsubscribe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyToken } from "@/lib/unsubscribe";

/**
 * One-click unsubscribe. Two callers:
 *  - mail clients (RFC 8058 List-Unsubscribe-Post): POST with the token in the query string
 *  - our confirmation page: a form POST, which gets a redirect back to the page
 * Only POST is accepted so link prefetchers and security scanners (which issue GETs) cannot unsubscribe anyone.
 */
export async function POST(request: NextRequest) {
  const fromForm = (request.headers.get("content-type") ?? "").includes(
    "application/x-www-form-urlencoded",
  );
  let token = request.nextUrl.searchParams.get("t");
  if (!token && fromForm)
    token = String((await request.formData().catch(() => null))?.get("t") ?? "");

  let payload: ReturnType<typeof verifyToken> = null;
  try {
    payload = token ? verifyToken(token) : null;
  } catch {
    // Misconfiguration (no UNSUBSCRIBE_SECRET in production): fail closed, but cleanly.
    return fromForm
      ? NextResponse.redirect(new URL("/unsubscribe?error=2", request.url), 303)
      : NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!payload) {
    return fromForm
      ? NextResponse.redirect(new URL("/unsubscribe?error=1", request.url), 303)
      : NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  try {
    await applyUnsubscribe(createSupabaseAdminClient(), payload);
  } catch {
    return fromForm
      ? NextResponse.redirect(new URL("/unsubscribe?error=2", request.url), 303)
      : NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  return fromForm
    ? NextResponse.redirect(new URL(`/unsubscribe?done=${payload.k}`, request.url), 303)
    : NextResponse.json({ unsubscribed: true });
}
