import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { flagInputSchema } from "@/lib/flags";

/** "Report a problem" on a listing. One open flag per student and field; repeats are accepted silently. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const parsed = flagInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "invalid_input",
        message: "Pick what is wrong (and keep notes under 500 characters).",
      },
      { status: 400 },
    );

  const { error } = await auth.supabase
    .from("flags")
    .insert({ ...parsed.data, user_id: auth.user.id });
  if (!error) return NextResponse.json({ flagged: true }, { status: 201 });
  if (error.code === "23505") return NextResponse.json({ flagged: true, already: true });
  if (error.code === "23503")
    return NextResponse.json(
      { error: "not_found", message: "We could not find that competition." },
      { status: 404 },
    );
  return NextResponse.json(
    { error: "unavailable", message: "Something went wrong. Try again." },
    { status: 500 },
  );
}
