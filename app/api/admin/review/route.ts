import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/api";

/** Open review items, oldest first, with candidate listings so the admin can compare. */
export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("review_queue")
    .select("id,kind,payload,candidate_competition_id,created_at")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const candidateIds = [
    ...new Set((data ?? []).map((r) => r.candidate_competition_id).filter((x): x is string => !!x)),
  ];
  const { data: cands } = candidateIds.length
    ? await auth.supabase
        .from("competitions")
        .select("id,slug,title,host_name,flyer_url")
        .in("id", candidateIds)
    : { data: [] };
  const byId = new Map((cands ?? []).map((c) => [c.id, c]));
  return NextResponse.json(
    {
      items: (data ?? []).map((r) => ({
        ...r,
        candidate: r.candidate_competition_id
          ? (byId.get(r.candidate_competition_id) ?? null)
          : null,
      })),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
