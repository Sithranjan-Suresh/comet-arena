import {
  PLACE_LABEL,
  type PastWinner,
  type PrepResource,
  safeResourceUrl,
} from "@/lib/data/extras";

/** Host-verified podium results. Names appear only for students who opted in. */
export function PastWinners({ winners }: { winners: PastWinner[] }) {
  if (winners.length === 0) return null;
  return (
    <section aria-labelledby="winners" className="space-y-2">
      <h2 id="winners" className="text-2xl font-bold">
        Past winners
      </h2>
      <ol className="space-y-1">
        {winners.map((w, i) => (
          <li key={`${w.place}-${i}`} className="flex flex-wrap gap-x-3">
            <span className="font-semibold">{PLACE_LABEL[w.place]}</span>
            <span>
              {[w.team_name, w.display ?? (w.team_name ? null : "A UTD student")]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="text-ink-muted text-sm">{w.season}</span>
          </li>
        ))}
      </ol>
      <p className="text-ink-muted text-sm">Results confirmed by the host.</p>
    </section>
  );
}

/** Links the host added to help students prepare (past cases, rubrics, rules). */
export function PrepResources({ resources }: { resources: PrepResource[] }) {
  if (resources.length === 0) return null;
  return (
    <section aria-labelledby="prep" className="space-y-2">
      <h2 id="prep" className="text-2xl font-bold">
        Prep resources
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        {resources.map((r) => {
          const url = safeResourceUrl(r.url);
          return (
            <li key={r.id}>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline"
                >
                  {r.label}
                </a>
              ) : (
                r.label
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
