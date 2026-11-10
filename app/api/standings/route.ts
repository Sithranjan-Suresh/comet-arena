import { NextResponse } from "next/server";
import { isMockMode } from "@/lib/env";
import { fixtureStandings, getStandings, standingsQuerySchema } from "@/lib/standings";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/** Public aggregate standings from host-verified results. Never lists individuals. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = standingsQuerySchema.parse({
    dimension: params.get("dimension") ?? undefined,
    season: params.get("season") ?? undefined,
  });
  const db = createSupabasePublicClient();
  if (!db && !isMockMode()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const data = db ? await getStandings(db, q) : fixtureStandings(q);
  if (!data) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json(data, {
    headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
