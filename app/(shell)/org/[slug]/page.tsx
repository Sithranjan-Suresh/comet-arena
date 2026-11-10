import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameCard } from "@/components/GameCard";
import { ClaimOrgButton } from "@/components/org/ClaimOrgButton";
import { SaveButton } from "@/components/SaveButton";
import { Chip, EmptyState, buttonClasses } from "@/components/ui";
import { getCompetitionsPage } from "@/lib/data/field";
import { getOrgBySlug } from "@/lib/data/orgs";
import { SLUG_PATTERN } from "@/lib/data/game-day";
import { discordUrl, instagramUrl } from "@/lib/orgs/links";
import { parseCompetitionQuery } from "@/lib/schemas/competition-query";

// Render on first request, then serve from the ISR cache and refresh every 5 minutes (data is also tagged
// "competitions" so a publish revalidates it at once). Viewer-specific state (saved, eligibility) loads client-side.
export const revalidate = 300;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) return null;
  return getOrgBySlug(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const org = await load((await params).slug);
  return org
    ? { title: org.name, description: `Competitions hosted by ${org.name} at UT Dallas.` }
    : { title: "Organization not found" };
}

export default async function OrgPage({ params }: Props) {
  const { slug } = await params;
  const org = await load(slug);
  if (!org) notFound();

  const query = parseCompetitionQuery(
    new URLSearchParams({ host: org.slug, include_past: "1", limit: "50" }),
  ).data!;
  const { items } = await getCompetitionsPage(query);
  const upcoming = items.filter((c) => c.status !== "past");
  const past = items.filter((c) => c.status === "past");

  const ig = instagramUrl(org.ig_handle);
  const discord = discordUrl(org.discord_url);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-4xl font-extrabold uppercase md:text-5xl">{org.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {org.verified && (
            <Chip className="bg-good text-chalk border-transparent">✓ Claimed by officers</Chip>
          )}
          {org.tags.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
        {!org.verified && <ClaimOrgButton orgId={org.id} orgName={org.name} />}
        {(ig || discord) && (
          <ul className="flex flex-wrap gap-4 text-sm font-semibold">
            {ig && (
              <li>
                <a href={ig} target="_blank" rel="noopener noreferrer" className="underline">
                  Instagram
                </a>
              </li>
            )}
            {discord && (
              <li>
                <a href={discord} target="_blank" rel="noopener noreferrer" className="underline">
                  Discord
                </a>
              </li>
            )}
          </ul>
        )}
      </header>

      <section aria-labelledby="upcoming">
        <h2 id="upcoming" className="mb-3 text-2xl font-bold">
          Competitions
        </h2>
        {upcoming.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((c) => (
              <li key={c.id} className="flex">
                <GameCard
                  card={c}
                  className="w-full"
                  action={<SaveButton competitionId={c.id} title={c.title} />}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nothing listed right now"
            description={`${org.name} has no upcoming competitions on Comet Arena. If they posted one, add it in a few seconds.`}
            action={
              <Link href="/report" className={buttonClasses("primary")}>
                Report a Game
              </Link>
            }
          />
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="past">
          <h2 id="past" className="mb-3 text-2xl font-bold">
            Past competitions
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((c) => (
              <li key={c.id} className="flex">
                <GameCard card={c} className="w-full opacity-90" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
