import { type PlayerStats } from "@/lib/player-stats";

/** The student's card: name, major and year, and the stat line. Private in v1. */
export function PlayerCard({
  name,
  major,
  classYear,
  stats,
}: {
  name: string;
  major: string | null;
  classYear: string | null;
  stats: PlayerStats;
}) {
  const sub = [major, classYear && classYear.charAt(0).toUpperCase() + classYear.slice(1)]
    .filter(Boolean)
    .join(" · ");
  const tiles: [string, number][] = [
    ["Entered", stats.entered],
    ["Advanced", stats.advanced],
    ["Podiums", stats.podiums],
    ["Wins", stats.wins],
  ];
  return (
    <section aria-label="Player card" className="bg-turf text-chalk rounded-2xl p-6 shadow-lg">
      <p className="text-utd-orange-text text-sm font-bold tracking-widest uppercase">
        Player Card
      </p>
      <h2 className="font-display text-4xl font-extrabold uppercase">{name}</h2>
      <p className="text-chalk-muted">{sub || "Add your major in Settings"}</p>
      <dl className="mt-5 grid grid-cols-4 gap-2 text-center">
        {tiles.map(([label, n]) => (
          <div key={label} className="bg-scoreboard rounded-lg py-3">
            <dd className="led-digits text-3xl">{n}</dd>
            <dt className="text-chalk-muted text-xs tracking-wide uppercase">{label}</dt>
          </div>
        ))}
      </dl>
      {stats.verified > 0 && (
        <p className="text-chalk-muted mt-3 text-sm">{stats.verified} host-verified</p>
      )}
    </section>
  );
}
