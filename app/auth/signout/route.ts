import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** POST-only (so a stray link or prefetch cannot sign anyone out). */
export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
