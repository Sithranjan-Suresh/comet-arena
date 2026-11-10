import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  type ParsedResults,
  officerErrorStatus,
  parseResultsCsv,
  resultRowSchema,
  resultsBodySchema,
} from "@/lib/office";
import { uuidSchema } from "@/lib/saves";

/** Upload results for a competition the caller's organization hosts. Matched students get a host-verified entry. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success)
    return NextResponse.json(
      { error: "not_found", message: "We could not find that competition." },
      { status: 404 },
    );
  const body = resultsBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "invalid_input", message: "Paste CSV text (email,result) or send rows." },
      { status: 400 },
    );

  let parsed: ParsedResults;
  if ("csv" in body.data) parsed = parseResultsCsv(body.data.csv);
  else {
    parsed = {
      rows: [] as ReturnType<typeof parseResultsCsv>["rows"],
      skipped: [] as ReturnType<typeof parseResultsCsv>["skipped"],
    };
    body.data.rows.forEach((r, i) => {
      const row = resultRowSchema.safeParse(r);
      if (row.success) parsed.rows.push(row.data);
      else parsed.skipped.push({ line: i + 1, reason: "Invalid row" });
    });
  }
  if (parsed.rows.length === 0)
    return NextResponse.json(
      { error: "invalid_input", message: "No valid rows to upload.", skipped: parsed.skipped },
      { status: 422 },
    );

  const { data, error } = await auth.supabase.rpc("officer_upload_results", {
    p_id: id.data,
    p_rows: parsed.rows as never,
  });
  if (error) {
    const e = officerErrorStatus(error.code);
    return NextResponse.json({ error: e.error, message: e.message }, { status: e.status });
  }
  const counts = data as { matched: number; unmatched: number };
  return NextResponse.json({ ...counts, skipped: parsed.skipped });
}
