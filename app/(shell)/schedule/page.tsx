import Link from "next/link";
import { CalendarSubscribe } from "@/components/schedule/CalendarSubscribe";
import { PastStages, WeekGroup } from "@/components/schedule/parts";
import { EmptyState, buttonClasses } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { getSchedule } from "@/lib/data/schedule";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Per-user page: must render on every request (never prerendered into a frozen redirect).
export const dynamic = "force-dynamic";

export const metadata = { title: "Schedule" };

export default async function SchedulePage() {
  const user = await requireUser("/schedule");
  const supabase = await createSupabaseServerClient();
  const [schedule, { data: profile }] = await Promise.all([
    getSchedule(supabase, user.id),
    supabase.from("users").select("ics_token").eq("id", user.id).maybeSingle(),
  ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-4xl font-extrabold uppercase">Schedule</h1>
        <p className="text-ink-muted">
          Every stage of every competition you saved, in order. Times are Central Time.
        </p>
      </div>
      {profile?.ics_token && <CalendarSubscribe appUrl={appUrl} token={profile.ics_token} />}

      {schedule.weeks.length === 0 && schedule.past.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Save a competition and every one of its deadlines shows up here, with warnings before each one."
          action={
            <Link href="/field" className={buttonClasses("primary")}>
              Browse The Field
            </Link>
          }
        />
      ) : (
        <>
          {schedule.weeks.length === 0 && (
            <EmptyState
              title="No upcoming deadlines"
              description="All your saved competitions are finished. Find your next one."
              action={
                <Link href="/field" className={buttonClasses("primary")}>
                  Browse The Field
                </Link>
              }
            />
          )}
          {schedule.weeks.map((w) => (
            <WeekGroup key={w.key} week={w} />
          ))}
          <PastStages stages={schedule.past} />
        </>
      )}
    </div>
  );
}
