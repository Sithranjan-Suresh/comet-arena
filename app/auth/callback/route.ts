import { NextResponse, type NextRequest } from "next/server";
import { classifyCallbackError } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** OAuth / magic-link landing: exchange the code for a session, then go where the user was heading. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));

  const failure = classifyCallbackError({
    error: searchParams.get("error"),
    error_description: searchParams.get("error_description"),
  });
  if (failure) return redirectToLogin(origin, failure, next);

  const code = searchParams.get("code");
  if (!code) return redirectToLogin(origin, "missing_code", next);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirectToLogin(
      origin,
      classifyCallbackError({ error: "exchange", error_description: error.message }) ??
        "callback_failed",
      next,
    );
  }

  // First-time users finish a 60-second onboarding before landing anywhere else.
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data: profile } = await supabase
      .from("users")
      .select("onboarded")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (profile && !profile.onboarded) {
      return NextResponse.redirect(`${origin}/onboarding?next=${encodeURIComponent(next)}`);
    }
  }
  return NextResponse.redirect(`${origin}${next}`);
}

function redirectToLogin(origin: string, error: string, next: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", error);
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
