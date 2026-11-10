import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { profileInputSchema } from "@/lib/schemas/profile";

const COLUMNS = "major,class_year,interests,roles,email_warnings,digest,public_results,onboarded";

/** Current user's profile. */
export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.supabase
    .from("users")
    .select(COLUMNS)
    .eq("id", auth.user.id)
    .single();
  if (error) return NextResponse.json({ error: "profile_unavailable" }, { status: 500 });
  return NextResponse.json(data);
}

/** Update the current user's profile. Only whitelisted columns; RLS also restricts to their own row. */
export async function PUT(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = profileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  const { data, error } = await auth.supabase
    .from("users")
    .update(parsed.data)
    .eq("id", auth.user.id)
    .select(COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json(data);
}
