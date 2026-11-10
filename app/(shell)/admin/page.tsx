import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Overview" };

export default async function AdminOverview() {
  const db = await createSupabaseServerClient();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [review, pending, competitions, orgs] = await Promise.all([
    count(
      db.from("review_queue").select("id", { count: "exact", head: true }).eq("status", "open"),
    ),
    count(
      db.from("submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ),
    count(
      db
        .from("competitions")
        .select("id", { count: "exact", head: true })
        .neq("status", "rejected"),
    ),
    count(db.from("orgs").select("id", { count: "exact", head: true })),
  ]);
  const stats = [
    { label: "Open review items", value: review },
    { label: "Pending submissions", value: pending },
    { label: "Competitions", value: competitions },
    { label: "Organizations", value: orgs },
  ];
  return (
    <section aria-label="Overview">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label} className="bg-chalk rounded-xl p-5">
            <p className="text-ink-muted text-sm">{s.label}</p>
            <p className="text-4xl font-extrabold">{s.value}</p>
          </li>
        ))}
      </ul>
      <p className="text-ink-muted mt-6">
        Ingestion health is on{" "}
        <Link className="underline" href="/admin/ingest">
          Ingest runs
        </Link>
        .
      </p>
    </section>
  );
}
