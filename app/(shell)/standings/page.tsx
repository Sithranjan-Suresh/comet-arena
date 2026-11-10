import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { isMockMode } from "@/lib/env";
import { RESULT_POINTS, TIER_MULTIPLIER } from "@/lib/points";
import {
  DIMENSIONS,
  type Dimension,
  fixtureStandings,
  getStandings,
  headline,
  standingsQuerySchema,
} from "@/lib/standings";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export const revalidate = 300;
export const metadata = {
  title: "Standings",
  description:
    "Which clubs, majors and competition categories are winning at UT Dallas, from host-verified results.",
};

const TAB_LABEL: Record<Dimension, string> = {
  org: "Clubs",
  major: "Majors",
  category: "Categories",
};
const href = (dimension: Dimension, season?: string) =>
  `/standings?dimension=${dimension}${season ? `&season=${encodeURIComponent(season)}` : ""}`;

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const q = standingsQuerySchema.parse({ dimension: raw.dimension, season: raw.season });
  const db = createSupabasePublicClient();
  const data = db ? await getStandings(db, q) : isMockMode() ? fixtureStandings(q) : null;
  const top = headline(data?.rows[0], q.dimension, q.season);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="mb-2 text-4xl font-extrabold uppercase">Standings</h1>
        <p className="text-ink-muted">
          Built only from results a host has verified. No individual students are listed, and a
          major needs at least three students with results before it appears.
        </p>
      </header>

      <nav aria-label="Standings view" className="flex flex-wrap gap-2">
        {DIMENSIONS.map((d) => (
          <Link
            key={d}
            href={href(d, q.season)}
            aria-current={d === q.dimension ? "page" : undefined}
            className={`min-h-11 rounded-lg px-4 py-2.5 font-semibold ${d === q.dimension ? "bg-turf text-chalk" : "bg-chalk text-ink ring-court-dark ring-1"}`}
          >
            {TAB_LABEL[d]}
          </Link>
        ))}
      </nav>

      {data && data.seasons.length > 0 && (
        <nav aria-label="Season" className="flex flex-wrap gap-2 text-sm">
          <Link
            href={href(q.dimension)}
            aria-current={!q.season ? "page" : undefined}
            className={`rounded-full px-3 py-1 font-semibold ${!q.season ? "bg-turf text-chalk" : "bg-chalk"}`}
          >
            All time
          </Link>
          {data.seasons.map((s) => (
            <Link
              key={s}
              href={href(q.dimension, s)}
              aria-current={q.season === s ? "page" : undefined}
              className={`rounded-full px-3 py-1 font-semibold ${q.season === s ? "bg-turf text-chalk" : "bg-chalk"}`}
            >
              {s}
            </Link>
          ))}
        </nav>
      )}

      {!data ? (
        <EmptyState
          title="Standings are unavailable right now"
          description="Try again in a minute."
        />
      ) : data.rows.length === 0 ? (
        <EmptyState
          title="No verified results yet"
          description="Standings appear when officers upload verified results for their competitions."
        />
      ) : (
        <>
          {top && <p className="bg-turf text-chalk rounded-xl p-4 text-lg font-semibold">{top}</p>}
          <table className="w-full text-left">
            <caption className="sr-only">{TAB_LABEL[q.dimension]} ranked by points</caption>
            <thead>
              <tr className="text-ink-muted border-b border-current/10 text-sm">
                <th scope="col" className="py-2 pr-2">
                  #
                </th>
                <th scope="col" className="py-2 pr-4">
                  {TAB_LABEL[q.dimension].replace(/es$|s$/, "")}
                </th>
                <th scope="col" className="py-2 pr-4 text-right">
                  Points
                </th>
                <th scope="col" className="py-2 pr-4 text-right">
                  Wins
                </th>
                <th scope="col" className="py-2 text-right">
                  Podiums
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.key} className="border-b border-current/5">
                  <td className="py-2 pr-2 font-bold tabular-nums">{i + 1}</td>
                  <td className="py-2 pr-4 font-semibold">{r.label.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.points}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.wins}</td>
                  <td className="py-2 text-right tabular-nums">{r.podiums}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <details className="bg-chalk rounded-xl p-4">
        <summary className="cursor-pointer font-semibold">How points work</summary>
        <p className="mt-2 text-sm">
          Each verified result earns points:{" "}
          {Object.entries(RESULT_POINTS)
            .map(
              ([k, v]) =>
                `${k === "first" ? "1st" : k === "second" ? "2nd" : k === "third" ? "3rd" : k} ${v}`,
            )
            .join(", ")}
          . The total is multiplied by the competition&apos;s reach: campus x
          {TIER_MULTIPLIER.campus}, regional x{TIER_MULTIPLIER.regional}, national x
          {TIER_MULTIPLIER.national}. If a host supplies its own score, that score is used instead.
        </p>
      </details>
    </div>
  );
}
