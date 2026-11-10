import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { type TickerItem, getTickerItems } from "@/lib/data/ticker";

/** Data-fetching wrapper. Renders nothing when there is nothing to show. */
export async function Ticker() {
  return <TickerBar items={await getTickerItems()} />;
}

/** ESPN-style ticker of the next deadlines (presentational; `fixed` positions it above the tab bar). */
export function TickerBar({ items, fixed = true }: { items: TickerItem[]; fixed?: boolean }) {
  if (items.length === 0) return null;

  const renderItems = (hidden: boolean) =>
    items.map((it) => (
      <li key={`${hidden ? "dup-" : ""}${it.slug}`} className="flex shrink-0 items-center gap-2">
        <Link
          href={`/game/${it.slug}`}
          tabIndex={hidden ? -1 : undefined}
          className="font-display text-base font-bold tracking-wide whitespace-nowrap text-chalk uppercase hover:underline"
        >
          {it.title}
        </Link>
        <span className="text-chalk-muted text-sm whitespace-nowrap">{it.stage}</span>
        <Countdown deadline={it.deadline} variant="inline" className="led-digits text-sm" />
        <span aria-hidden="true" className="text-utd-orange px-2">
          ◆
        </span>
      </li>
    ));

  return (
    <aside
      aria-label="Upcoming deadlines"
      className={`ticker bg-scoreboard overflow-hidden border-t border-turf-light ${fixed ? "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 md:bottom-0" : "rounded-lg"}`}
    >
      <div className="ticker-track flex w-max items-center py-2">
        <ul className="flex items-center gap-2 px-4">{renderItems(false)}</ul>
        {/* Duplicate list makes the loop seamless; hidden from assistive tech and the tab order. */}
        <ul aria-hidden="true" className="ticker-dup flex items-center gap-2 px-4">
          {renderItems(true)}
        </ul>
      </div>
    </aside>
  );
}
