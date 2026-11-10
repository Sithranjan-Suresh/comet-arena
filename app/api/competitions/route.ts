import { NextResponse } from "next/server";
import { queryCompetitions } from "@/lib/data/competitions";
import { parseCompetitionQuery } from "@/lib/schemas/competition-query";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/** Public listing of competitions (The Field). Reads from the database only, never live third-party APIs. */
export async function GET(request: Request) {
  const parsed = parseCompetitionQuery(new URL(request.url).searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_query",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      { status: 400 },
    );
  }
  const db = createSupabasePublicClient();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  try {
    const page = await queryCompetitions(db, parsed.data);
    return NextResponse.json(page, {
      headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
