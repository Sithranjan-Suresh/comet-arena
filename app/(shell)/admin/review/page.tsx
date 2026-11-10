import { ReviewCard, type ReviewCardItem } from "@/components/admin/ReviewCard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Review" };

interface Payload {
  extraction?: ReviewCardItem["extraction"];
  source?: { source_url?: string | null; flyer_url?: string | null };
  candidates?: { id: string }[];
  post_hoc?: { new_id: string; new_title: string; similarity: number };
}

export default async function AdminReview() {
  const db = await createSupabaseServerClient();
  const { data } = await db
    .from("review_queue")
    .select("id,kind,payload,candidate_competition_id")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(50);
  const rows = data ?? [];

  const ids = new Set<string>();
  for (const r of rows) {
    if (r.candidate_competition_id) ids.add(r.candidate_competition_id);
    for (const c of (r.payload as Payload | null)?.candidates ?? []) ids.add(c.id);
  }
  const { data: comps } = ids.size
    ? await db
        .from("competitions")
        .select("id,slug,title,host_name")
        .in("id", [...ids])
    : { data: [] };
  const byId = new Map((comps ?? []).map((c) => [c.id, c]));

  const items: ReviewCardItem[] = rows.flatMap((r) => {
    const p = r.payload as Payload | null;
    if (!p?.extraction && !p?.post_hoc) return [];
    const candidateIds = [
      ...new Set(
        [r.candidate_competition_id, ...(p.candidates ?? []).map((c) => c.id)].filter(
          (x): x is string => !!x,
        ),
      ),
    ];
    return [
      {
        id: r.id,
        kind: r.kind,
        extraction: p.extraction ?? {
          title: p.post_hoc?.new_title ?? null,
          host: null,
          description: null,
          prize: null,
          location: null,
          register_url: null,
          confidence: 1,
          stages: [],
        },
        postHoc: p.post_hoc
          ? { newTitle: p.post_hoc.new_title, similarity: p.post_hoc.similarity }
          : null,
        sourceUrl: p.source?.source_url ?? null,
        flyerUrl: p.source?.flyer_url ?? null,
        candidates: candidateIds.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
      },
    ];
  });

  return (
    <section aria-label="Review queue">
      <h2 className="mb-3 text-2xl font-bold">Review queue ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-ink-muted">
          Nothing to review. New low-confidence and possible-duplicate posts land here.
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ReviewCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
