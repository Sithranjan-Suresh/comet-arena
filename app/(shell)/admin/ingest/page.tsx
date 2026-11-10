import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Ingest runs" };

const CLASSES = ["competition", "results", "not_competition", "error"] as const;

export default async function AdminIngest() {
  const db = await createSupabaseServerClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const counts = await Promise.all(
    CLASSES.map(async (c) => ({
      c,
      n:
        (
          await db
            .from("ingest_posts")
            .select("ig_post_id", { count: "exact", head: true })
            .eq("classification", c)
            .gte("seen_at", since)
        ).count ?? 0,
    })),
  );
  const { data: recent } = await db
    .from("ingest_posts")
    .select("ig_post_id,org_id,permalink,classification,seen_at")
    .order("seen_at", { ascending: false })
    .limit(50);
  const orgIds = [
    ...new Set((recent ?? []).map((p) => p.org_id).filter((id): id is string => !!id)),
  ];
  const { data: orgRows } = orgIds.length
    ? await db.from("orgs").select("id,name").in("id", orgIds)
    : { data: [] };
  const orgName = new Map((orgRows ?? []).map((o) => [o.id, o.name]));
  return (
    <section aria-label="Ingest runs">
      <h2 className="mb-3 text-2xl font-bold">Posts seen in the last 7 days</h2>
      <ul className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {counts.map(({ c, n }) => (
          <li key={c} className="bg-chalk rounded-xl p-5">
            <p className="text-ink-muted text-sm">{c.replace("_", " ")}</p>
            <p className="text-3xl font-extrabold">{n}</p>
          </li>
        ))}
      </ul>
      <h2 className="mb-3 text-2xl font-bold">Most recent posts</h2>
      <ul className="space-y-1 text-sm">
        {(recent ?? []).map((p) => (
          <li key={p.ig_post_id}>
            <span className="text-ink-muted">
              {new Date(p.seen_at).toLocaleDateString("en-US", { timeZone: "America/Chicago" })}
            </span>{" "}
            {(p.org_id && orgName.get(p.org_id)) || "Unknown org"}: {p.classification}{" "}
            {p.permalink && (
              <a className="underline" href={p.permalink} target="_blank" rel="noopener noreferrer">
                post
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
