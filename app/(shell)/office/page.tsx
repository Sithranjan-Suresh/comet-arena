import Link from "next/link";
import { EmptyState, buttonClasses } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCT } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Front Office", robots: { index: false } };

/** An approved officer's home: the organizations they run and those organizations' listings. */
export default async function OfficePage() {
  const user = await requireUser("/office");
  const db = await createSupabaseServerClient();
  const { data: orgs } = await db
    .from("orgs")
    .select("id,name,slug")
    .eq("claimed_by", user.id)
    .order("name");

  if (!orgs?.length)
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 text-4xl font-extrabold uppercase">Front Office</h1>
        <EmptyState
          title="You do not run an organization here yet"
          description="Find your club on its page and choose “Are you an officer? Claim this page”. An admin reviews every request."
          action={
            <Link href="/field" className={buttonClasses("primary")}>
              Browse The Field
            </Link>
          }
        />
      </div>
    );

  const { data: comps } = await db
    .from("competitions")
    .select("id,slug,title,status,host_org_id")
    .in(
      "host_org_id",
      orgs.map((o) => o.id),
    )
    .neq("status", "rejected")
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-10">
      <h1 className="text-4xl font-extrabold uppercase">Front Office</h1>
      {orgs.map((org) => {
        const mine = (comps ?? []).filter((c) => c.host_org_id === org.id);
        return (
          <section key={org.id} aria-label={org.name} className="space-y-3">
            <h2 className="text-2xl font-bold">
              <Link href={`/org/${org.slug}`} className="underline">
                {org.name}
              </Link>
            </h2>
            {mine.length === 0 ? (
              <p className="text-ink-muted">
                No listings yet. They appear here when we find your posts, or when someone reports
                one.
              </p>
            ) : (
              <ul className="space-y-2">
                {mine.map((c) => (
                  <li
                    key={c.id}
                    className="bg-chalk flex flex-wrap items-center justify-between gap-2 rounded-xl p-3"
                  >
                    <span>
                      <Link href={`/game/${c.slug}`} className="font-semibold underline">
                        {c.title}
                      </Link>{" "}
                      <span className="text-ink-muted text-sm">({c.status})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <p className="text-ink-muted text-sm">Checked {formatCT(new Date().toISOString())}.</p>
    </div>
  );
}
