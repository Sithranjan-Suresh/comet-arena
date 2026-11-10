import Link from "next/link";
import { RoleChip, EmptyState, buttonClasses } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { getHub } from "@/lib/data/free-agency-hub";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Free Agency" };
// Per-user page: render on every request.
export const dynamic = "force-dynamic";

export default async function FreeAgencyPage() {
  const user = await requireUser("/free-agency");
  const hub = await getHub(await createSupabaseServerClient(), user.id);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="mb-1 text-4xl font-extrabold uppercase">Free Agency</h1>
        <p className="text-ink-muted">
          Never compete alone. Your posts, and who is looking for teammates in the competitions you
          saved.
        </p>
      </div>

      <section aria-labelledby="mine">
        <h2 id="mine" className="mb-3 text-2xl font-bold">
          My posts
        </h2>
        {hub.myPosts.length === 0 ? (
          <EmptyState
            title="You have not posted yet"
            description="Open any competition and tap “I need a team” or “My team needs people”."
            action={
              <Link href="/field" className={buttonClasses("primary")}>
                Browse The Field
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {hub.myPosts.map((p) => (
              <li
                key={`${p.kind}-${p.id}`}
                className="bg-chalk ring-court-dark space-y-2 rounded-lg p-4 ring-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    <Link href={`/game/${p.slug}#board`} className="underline">
                      {p.title}
                    </Link>
                    <span className="text-ink-muted font-normal">
                      {" "}
                      · {p.kind === "agent" ? "Free agent" : `Team opening: ${p.teamName}`}
                    </span>
                  </p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.status === "open" ? "bg-good text-chalk" : "bg-ink-muted text-chalk"}`}
                  >
                    {p.status === "open" ? "Open" : "Closed"}
                  </span>
                </div>
                <ul className="flex flex-wrap gap-1.5" aria-label="Roles">
                  {p.roles.map((r) => (
                    <li key={r}>
                      <RoleChip role={r} />
                    </li>
                  ))}
                </ul>
                {p.note && <p className="text-sm">{p.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="boards">
        <h2 id="boards" className="mb-3 text-2xl font-bold">
          Boards for your saved competitions
        </h2>
        {hub.boards.length === 0 ? (
          <EmptyState
            title="No saved competitions"
            description="Save a competition and its Free Agency board shows up here."
            action={
              <Link href="/field" className={buttonClasses("primary")}>
                Browse The Field
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {hub.boards.map((b) => (
              <li key={b.competition_id} className="bg-turf text-chalk rounded-xl p-4">
                <p className="font-display text-xl font-bold">
                  <Link href={`/game/${b.slug}#board`} className="hover:underline">
                    {b.title}
                  </Link>
                </p>
                <p className="text-chalk-muted mt-1 text-sm">
                  {b.agents} free agent{b.agents === 1 ? "" : "s"} · {b.openings} team opening
                  {b.openings === 1 ? "" : "s"}
                  {b.registrationClosed && " · registration closed"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
