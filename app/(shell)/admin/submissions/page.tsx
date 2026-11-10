import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Submissions" };

export default async function AdminSubmissions() {
  const db = await createSupabaseServerClient();
  const { data } = await db
    .from("submissions")
    .select("id,raw_url,image_path,status,created_at,competition_id,merged_into")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = data ?? [];
  return (
    <section aria-label="Submissions">
      <h2 className="mb-3 text-2xl font-bold">Latest submissions</h2>
      {rows.length === 0 ? (
        <p className="text-ink-muted">No submissions yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-ink-muted border-b border-current/10">
              <th className="py-2 pr-4">When</th>
              <th className="py-2 pr-4">Source</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-current/5">
                <td className="py-2 pr-4 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" })}
                </td>
                <td className="max-w-xs truncate py-2 pr-4">{r.raw_url ?? "Uploaded flyer"}</td>
                <td className="py-2 pr-4">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
