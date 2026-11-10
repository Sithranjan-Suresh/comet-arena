import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading your schedule" className="space-y-3">
      <Skeleton className="h-10 w-48" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
