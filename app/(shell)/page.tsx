import Link from "next/link";
import { Suspense } from "react";
import { GameCard } from "@/components/GameCard";
import { HomeSwitch } from "@/components/home/HomeSwitch";
import { SaveButton } from "@/components/SaveButton";
import { WeeklySignup } from "@/components/WeeklySignup";
import { buttonClasses } from "@/components/ui";
import { getCompetitionsPage } from "@/lib/data/field";
import { parseCompetitionQuery } from "@/lib/schemas/competition-query";

export const metadata = {
  title: { absolute: "Comet Arena | Every UTD competition in one place" },
  description:
    "Never miss a UTD competition, and never compete alone. Case comps, hackathons, pitch, research, design and speaking competitions at UT Dallas.",
};

export default async function HomePage() {
  const query = parseCompetitionQuery(new URLSearchParams({ limit: "6" })).data!;
  const { items } = await getCompetitionsPage(query).catch(() => ({ items: [] }));

  return (
    <Suspense>
      <HomeSwitch>
        <div className="space-y-12">
          <section aria-labelledby="hero" className="bg-turf text-chalk rounded-2xl p-8 md:p-12">
            <p className="text-utd-orange text-sm font-bold tracking-widest uppercase">
              UT Dallas competitions
            </p>
            <h1
              id="hero"
              className="font-display mt-2 max-w-3xl text-5xl leading-none font-extrabold uppercase md:text-7xl"
            >
              Never miss a competition. Never compete alone.
            </h1>
            <p className="text-chalk-muted mt-4 max-w-2xl text-lg">
              Every case comp, hackathon, pitch, research, design and speaking competition at UTD in
              one place. We read the flyers clubs already post, put every deadline on your calendar,
              and help you find a team.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/field" className={buttonClasses("primary", "md", "px-6 text-lg")}>
                Browse The Field
              </Link>
              <Link
                href="/login"
                className={buttonClasses("secondary", "md", "bg-turf-light px-6 text-lg")}
              >
                Sign in to get warnings
              </Link>
            </div>
          </section>

          {items.length > 0 && (
            <section aria-labelledby="closing">
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 id="closing" className="text-3xl font-bold">
                  Closing soon
                </h2>
                <Link href="/field" className="font-semibold underline">
                  See all
                </Link>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((c) => (
                  <li key={c.id} className="flex">
                    <GameCard
                      card={c}
                      className="w-full"
                      action={<SaveButton competitionId={c.id} title={c.title} />}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <WeeklySignup />
        </div>
      </HomeSwitch>
    </Suspense>
  );
}
