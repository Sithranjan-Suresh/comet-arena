import Link from "next/link";
import { ResolveFlagButton } from "@/components/admin/ResolveFlagButton";
import { FLAG_LABEL, type FlagField } from "@/lib/flags";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Flags" };

export default async function AdminFlags() {
  const db = await createSupabaseServerClient();
  const { data } = await db
    .from("flags")
    .select("id,competition_id,field,note,created_at")
    .eq("resolved", false)
    .order("created_at", { ascending: true })
    .limit(100);
  const flags = data ?? [];
  const ids = [...new Set(flags.map((f) => f.competition_id))];
  const { data: comps } = ids.length
    ? await db.from("competitions").select("id,slug,title").in("id", ids)
    : { data: [] };
  const byId = new Map((comps ?? []).map((c) => [c.id, c]));

  return (
    <section aria-label="Open flags">
      <h2 className="mb-3 text-2xl font-bold">Open flags ({flags.length})</h2>
      {flags.length === 0 ? (
        <p className="text-ink-muted">No open flags.</p>
      ) : (
        <ul className="space-y-3">
          {flags.map((f) => {
            const c = byId.get(f.competition_id);
            return (
              <li
                key={f.id}
                className="bg-chalk flex flex-wrap items-start justify-between gap-3 rounded-xl p-4"
              >
                <div>
                  <p className="font-semibold">
                    {c ? (
                      <Link className="underline" href={`/game/${c.slug}`}>
                        {c.title}
                      </Link>
                    ) : (
                      "Deleted competition"
                    )}
                  </p>
                  <p className="text-sm">{FLAG_LABEL[f.field as FlagField] ?? f.field}</p>
                  {f.note && <p className="text-ink-muted mt-1 text-sm">&ldquo;{f.note}&rdquo;</p>}
                </div>
                <ResolveFlagButton id={f.id} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
