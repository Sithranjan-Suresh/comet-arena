import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { loginPathFor, needsAuth } from "@/lib/auth/routes";

/**
 * 1. Refreshes the Supabase session cookie on every request (so Server Components see a valid user).
 * 2. Redirects signed-out visitors away from protected routes to /login?next=...
 *
 * If Supabase is not configured (mock/dev without a project) every visitor counts as signed out.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  let signedIn = false;

  if (url && anon) {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    });
    // getUser() validates the token with Supabase (unlike getSession()) and refreshes it if needed.
    const { data } = await supabase.auth.getUser();
    signedIn = !!data.user;
  }

  const { pathname, search } = request.nextUrl;
  if (!signedIn && needsAuth(pathname)) {
    return NextResponse.redirect(new URL(loginPathFor(pathname, search), request.url));
  }
  return response;
}

export const config = {
  // Skip Next internals and static files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
