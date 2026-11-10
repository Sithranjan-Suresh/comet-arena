import { ClaimDecision } from "@/components/admin/ClaimDecision";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Claims" };

export default async function AdminClaims() {
  const db = await createSupabaseServerClient();
  const { data } = await db
    .from("org_claims")
    .select("id,org_id,user_id,note,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  const claims = data ?? [];
  const orgIds = [...new Set(claims.map((c) => c.org_id))];
  const userIds = [...new Set(claims.map((c) => c.user_id))];
  const [{ data: orgs }, { data: users }] = await Promise.all([
    orgIds.length
      ? db.from("orgs").select("id,name,claimed_by").in("id", orgIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? db.from("users").select("id,email,name").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);
  const org = new Map((orgs ?? []).map((o) => [o.id, o]));
  const user = new Map((users ?? []).map((u) => [u.id, u]));

  return (
    <section aria-label="Pending claims">
      <h2 className="mb-1 text-2xl font-bold">Officer claims ({claims.length})</h2>
      <p className="text-ink-muted mb-4 text-sm">
        Check that the requester really leads the organization (their club page, an officer list, or
        the club&apos;s Instagram) before approving.
      </p>
      {claims.length === 0 ? (
        <p className="text-ink-muted">No pending claims.</p>
      ) : (
        <ul className="space-y-3">
          {claims.map((c) => (
            <li
              key={c.id}
              className="bg-chalk flex flex-wrap items-start justify-between gap-3 rounded-xl p-4"
            >
              <div>
                <p className="font-semibold">{org.get(c.org_id)?.name ?? "Unknown organization"}</p>
                <p className="text-sm">
                  {user.get(c.user_id)?.name ?? "Student"} ({user.get(c.user_id)?.email})
                </p>
                {c.note && <p className="text-ink-muted mt-1 text-sm">&ldquo;{c.note}&rdquo;</p>}
                {org.get(c.org_id)?.claimed_by && (
                  <p className="text-warn mt-1 text-sm font-semibold">
                    Already claimed by someone else. Approving will fail.
                  </p>
                )}
              </div>
              <ClaimDecision id={c.id} orgName={org.get(c.org_id)?.name ?? "this organization"} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
