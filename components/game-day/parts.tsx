import Link from "next/link";
import { CategoryBadge, VerifyBadge } from "@/components/ui";
import { buttonClasses } from "@/components/ui";
import {
  SOURCE_LABEL,
  COST_LABEL,
  FORMAT_LABEL,
  TIER_LABEL,
  safeExternalUrl,
  teamSizeLabel,
} from "@/lib/format";
import type { GameDayDTO } from "@/lib/schemas";
import { formatCT, relativeUpdated } from "@/lib/time";

export function GameHeader({ dto, now }: { dto: GameDayDTO; now?: Date }) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <VerifyBadge status={dto.status} />
        {dto.tier !== "campus" && (
          <span className="bg-turf text-chalk rounded-full px-2.5 py-0.5 text-xs font-semibold">
            {TIER_LABEL[dto.tier]}
          </span>
        )}
        {!dto.utd_only && (
          <span className="bg-chalk text-ink ring-court-dark rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1">
            Open beyond UTD
          </span>
        )}
      </div>
      <h1 className="text-4xl leading-tight font-extrabold uppercase md:text-5xl">{dto.title}</h1>
      <p className="text-ink-muted">
        {dto.host_name &&
          (dto.host_slug ? (
            <>
              Hosted by{" "}
              <Link href={`/org/${dto.host_slug}`} className="text-ink font-semibold underline">
                {dto.host_name}
              </Link>
            </>
          ) : (
            <>Hosted by {dto.host_name}</>
          ))}
        {dto.host_name && " · "}
        <time dateTime={dto.updated_at}>{relativeUpdated(dto.updated_at, now)}</time>
      </p>
      {dto.categories.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Categories">
          {dto.categories.map((c) => (
            <li key={c}>
              <CategoryBadge category={c} />
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}

/** Prize, cost, format, location and team size at a glance. */
export function InfoGrid({ dto }: { dto: GameDayDTO }) {
  const items: [string, string][] = [
    ["Prize", dto.prize ?? "Not listed"],
    ["Cost", COST_LABEL[dto.cost]],
    ["Format", FORMAT_LABEL[dto.format]],
  ];
  if (dto.location) items.push(["Where", dto.location]);
  const team = teamSizeLabel(dto.eligibility);
  if (team) items.push(["Team", team]);
  if (dto.beginner_friendly) items.push(["Experience", "Beginners welcome"]);
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="bg-chalk ring-court-dark rounded-lg p-3 ring-1">
          <dt className="text-ink-muted text-xs font-semibold tracking-wide uppercase">{k}</dt>
          <dd className="mt-0.5 font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Register button, or an honest message when there is nothing to click. */
export function RegisterButton({ dto }: { dto: GameDayDTO }) {
  if (dto.status === "past") {
    return (
      <p className="bg-ink-muted text-chalk inline-block rounded-lg px-4 py-3 font-semibold">
        This competition has ended
      </p>
    );
  }
  const url = safeExternalUrl(dto.register_url);
  if (!url) {
    return (
      <p className="bg-chalk text-ink ring-ink-muted inline-block rounded-lg px-4 py-3 font-semibold ring-1">
        Registration opens soon
      </p>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClasses("primary", "md", "px-6 text-lg")}
    >
      Register
      <span className="sr-only"> (opens the host&apos;s registration page in a new tab)</span>
    </a>
  );
}

/** Where we found this listing. Every link goes to the original post. */
export function SourceList({ dto }: { dto: GameDayDTO }) {
  if (dto.sources.length === 0) return null;
  return (
    <section aria-labelledby="sources">
      <h2 id="sources" className="mb-2 text-2xl font-bold">
        Sources
      </h2>
      <ul className="space-y-1 text-sm">
        {dto.sources.map((s, i) => {
          const url = safeExternalUrl(s.source_url);
          const label = `${SOURCE_LABEL[s.source]} · seen ${formatCT(s.seen_at, "date")}`;
          return (
            <li key={`${s.source}-${i}`}>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline"
                >
                  {label}
                </a>
              ) : (
                label
              )}
            </li>
          );
        })}
      </ul>
      {dto.status === "unverified" && (
        <p className="text-ink-muted mt-2 text-sm">
          Not yet confirmed by the host. Check the original post before you register.
          {dto.confirmations > 0 &&
            ` ${dto.confirmations} student${dto.confirmations === 1 ? "" : "s"} confirmed it.`}
        </p>
      )}
    </section>
  );
}
