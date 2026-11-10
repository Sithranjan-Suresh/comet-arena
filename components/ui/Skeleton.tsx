import { cn } from "@/lib/cn";

/** Loading placeholder. Decorative: pair with a visible/sr-only "Loading…" status where needed. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-court-dark", className)} />
  );
}

/** Skeleton shaped like a GameCard. */
export function GameCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading competition"
      className="space-y-3 rounded-xl bg-turf p-4"
    >
      <Skeleton className="h-6 w-3/4 bg-turf-light" />
      <Skeleton className="h-4 w-1/2 bg-turf-light" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 bg-turf-light" />
        <Skeleton className="h-6 w-16 bg-turf-light" />
      </div>
      <Skeleton className="h-10 w-full bg-turf-light" />
    </div>
  );
}
