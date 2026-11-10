import { GameCardSkeleton, Skeleton } from "@/components/ui";

/**
 * Skeleton for The Field while results stream in. Deliberately NOT at the shell root: a root-level
 * loading boundary makes Next flush a 200 before a page can call notFound(), so unknown Game Day
 * URLs would return 200 instead of 404.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-6 h-10 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <GameCardSkeleton key={i} />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
