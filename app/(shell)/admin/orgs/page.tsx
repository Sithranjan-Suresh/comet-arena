import Link from "next/link";
import { OrgCsvImport } from "@/components/admin/OrgCsvImport";
import { OrgHandleRow } from "@/components/admin/OrgHandleRow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Orgs" };
const PAGE = 50;

export default async function AdminOrgs({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; missing?: string }>;
}) {
  const { q = "", missing } = await searchParams;
  const db = await createSupabaseServerClient();
  let query = db.from("orgs").select("id,name,ig_handle,ig_account_type").order("name").limit(PAGE);
  if (missing === "1") query = query.is("ig_handle", null);
  const term = q.trim().replace(/[%,()]/g, " ");
  if (term) query = query.ilike("name", `%${term}%`);
  const { data } = await query;
  const orgs = data ?? [];
  const { count: withoutHandle } = await db
    .from("orgs")
    .select("id", { count: "exact", head: true })
    .is("ig_handle", null);

  return (
    <section aria-label="Organizations" className="space-y-8">
      <div>
        <h2 className="mb-1 text-2xl font-bold">Instagram handles</h2>
        <p className="text-ink-muted">
          {withoutHandle ?? 0} organizations have no handle yet.{" "}
          {missing === "1" ? (
            <Link className="underline" href="/admin/orgs">
              Show all
            </Link>
          ) : (
            <Link className="underline" href="/admin/orgs?missing=1">
              Show only those missing a handle
            </Link>
          )}
        </p>
        <form className="mt-3 flex gap-2" role="search" aria-label="Search organizations">
          <input
            name="q"
            defaultValue={q}
            aria-label="Search organizations"
            placeholder="Search by name"
            className="bg-chalk min-h-11 rounded-lg px-3"
          />
          {missing === "1" && <input type="hidden" name="missing" value="1" />}
          <button className="bg-turf text-chalk min-h-11 rounded-lg px-4 font-semibold">
            Search
          </button>
        </form>
      </div>
      {orgs.length === 0 ? (
        <p className="text-ink-muted">No organizations match.</p>
      ) : (
        <ul>
          {orgs.map((o) => (
            <OrgHandleRow key={o.id} org={o} />
          ))}
        </ul>
      )}
      <div>
        <h2 className="mb-3 text-2xl font-bold">Bulk import</h2>
        <OrgCsvImport />
      </div>
    </section>
  );
}
