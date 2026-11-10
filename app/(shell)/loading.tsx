import { GameCardSkeleton, Skeleton } from "@/components/ui";

/** Shown while any shell route streams in. */
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
