import Link from "next/link";
import type { ReactNode } from "react";
import { Countdown } from "@/components/Countdown";
import { CategoryBadge, VerifyBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { GameCardDTO } from "@/lib/schemas";

const MAX_BADGES = 3;

/**
 * A competition card (The Field, Scouting Report). The whole card is one link (stretched title link)
 * while the optional action slot, for example the Save button, stays independently clickable.
 */
export function GameCard({
  card,
  action,
  className,
}: {
  card: GameCardDTO;
  action?: ReactNode;
  className?: string;
}) {
  const extra = Math.max(0, card.categories.length - MAX_BADGES);
  const stage = card.next_stage;

  return (
    <article
      className={cn(
        "bg-turf text-chalk relative flex flex-col gap-3 rounded-xl p-4 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-utd-orange hover:shadow-lg",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-2xl leading-tight font-bold">
            <Link
              href={`/game/${card.slug}`}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {card.title}
            </Link>
          </h3>
          {card.host_name && <p className="text-chalk-muted text-sm">{card.host_name}</p>}
        </div>
        <VerifyBadge status={card.status} className="shrink-0" />
      </div>

      {card.categories.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Categories">
          {card.categories.slice(0, MAX_BADGES).map((c) => (
            <li key={c}>
              <CategoryBadge category={c} />
            </li>
          ))}
          {extra > 0 && (
            <li className="text-chalk-muted self-center text-xs font-semibold">+{extra} more</li>
          )}
        </ul>
      )}

      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="min-w-0">
          {stage ? (
            <>
              <p className="text-chalk-muted mb-1 truncate text-sm">{stage.name}</p>
              <Countdown deadline={stage.deadline_at} />
            </>
          ) : (
            <p className="text-chalk-muted text-sm">
              {card.status === "expected"
                ? "Expected again, dates not announced"
                : "Dates not announced"}
            </p>
          )}
          {card.prize && <p className="mt-2 text-sm font-semibold">{card.prize}</p>}
        </div>
        {action && <div className="relative z-10 shrink-0">{action}</div>}
      </div>
    </article>
  );
}
