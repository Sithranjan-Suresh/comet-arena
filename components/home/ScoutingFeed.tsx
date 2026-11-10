"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { GameCard } from "@/components/GameCard";
import { SaveButton } from "@/components/SaveButton";
import { Button, EmptyState, ErrorState, GameCardSkeleton, buttonClasses } from "@/components/ui";
import { REASON_LABEL } from "@/lib/feed";
import { fetchFeedPage } from "@/lib/feed-client";

/** Your Scouting Report: competitions you qualify for, urgent ones first, your interests boosted. */
export function ScoutingFeed() {
  const router = useRouter();
  const q = useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: ({ pageParam }) => fetchFeedPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  const needsOnboarding = q.data?.pages[0]?.needs_onboarding;
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding?next=%2F");
  }, [needsOnboarding, router]);

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section aria-labelledby="scout">
      <h1 id="scout" className="mb-1 text-4xl font-extrabold uppercase">
        Scouting Report
      </h1>
      <p className="text-ink-muted mb-6">
        Competitions you qualify for, closing soonest first, with your interests on top.{" "}
        <Link href="/settings" className="font-semibold underline">
          Change your interests
        </Link>
      </p>

      {q.isLoading ? (
        <div
          role="status"
          aria-label="Loading your Scouting Report"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {Array.from({ length: 3 }, (_, i) => (
            <GameCardSkeleton key={i} />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState
          message="We could not load your Scouting Report."
          onRetry={() => void q.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing matches yet"
          description="Add more interests or check The Field for everything that is open."
          action={
            <Link href="/field" className={buttonClasses("primary")}>
              Browse The Field
            </Link>
          }
        />
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(({ card, reasons }) => (
              <li key={card.id} className="flex flex-col gap-2">
                <GameCard
                  card={card}
                  className="flex-1"
                  action={<SaveButton competitionId={card.id} title={card.title} />}
                />
                {reasons.length > 0 && (
                  <ul aria-label="Why you are seeing this" className="flex flex-wrap gap-1.5">
                    {reasons.map((r) => (
                      <li
                        key={r}
                        className="bg-chalk text-ink ring-court-dark rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1"
                      >
                        {REASON_LABEL[r]}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="mt-6 text-center">
              <Button
                variant="secondary"
                loading={q.isFetchingNextPage}
                onClick={() => void q.fetchNextPage()}
              >
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
