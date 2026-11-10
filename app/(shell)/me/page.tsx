import Link from "next/link";
import { EntryList } from "@/components/player/EntryList";
import { PlayerCard } from "@/components/player/PlayerCard";
import { EmptyState, buttonClasses } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { listEntries } from "@/lib/entries";
import { computeStats } from "@/lib/player-stats";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Player Card" };
// Per-user page: render on every request.
export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await requireUser("/me");
  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, entries] = await Promise.all([
    supabase.from("users").select("name,major,class_year").eq("id", user.id).maybeSingle(),
    listEntries(supabase, user.id),
  ]);
  const list = entries ?? [];

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-extrabold uppercase">Player Card</h1>
      <PlayerCard
        name={profile?.name ?? user.email ?? "Student"}
        major={profile?.major ?? null}
        classYear={profile?.class_year ?? null}
        stats={computeStats(list)}
      />

      <p role="note" className="text-ink-muted text-sm">
        Only you can see this. Results you add are marked <strong>unverified</strong> until a host
        confirms them.
      </p>

      <section aria-labelledby="results">
        <h2 id="results" className="mb-3 text-2xl font-bold">
          My competitions
        </h2>
        {list.length === 0 ? (
          <EmptyState
            title="No results yet"
            description="Open a competition you entered and tap “I competed” to start your record."
            action={
              <Link href="/field" className={buttonClasses("primary")}>
                Browse The Field
              </Link>
            }
          />
        ) : (
          <EntryList entries={list} />
        )}
      </section>
    </div>
  );
}
