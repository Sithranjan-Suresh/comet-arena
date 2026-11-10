import { NextResponse } from "next/server";
import { importHandles, importSchema } from "@/lib/admin/org-handles";
import { supabaseHandleStore } from "@/lib/admin/org-handles-server";
import { requireApiAdmin } from "@/lib/auth/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Bulk handle import from CSV text: `club,instagram[,account_type]`. Returns what changed and every skipped row. */
export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;
  const body = importSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "invalid_input", message: "Paste CSV text (up to 500 KB)." },
      { status: 422 },
    );
  try {
    return NextResponse.json(
      await importHandles(body.data.csv, supabaseHandleStore(createSupabaseAdminClient())),
    );
  } catch {
    return NextResponse.json(
      {
        error: "unavailable",
        message: "Import failed part-way. Re-run it; finished rows are skipped as unchanged.",
      },
      { status: 503 },
    );
  }
}
