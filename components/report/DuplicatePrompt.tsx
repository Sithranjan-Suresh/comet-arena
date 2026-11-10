"use client";
import Link from "next/link";
import { Button } from "@/components/ui";
import type { PossibleMatch } from "@/lib/submit/handle";

/**
 * "Same competition?" (product_spec CL-2). Shown when the submission matches a listing that already exists.
 * Yes adds the student's confirmation to that listing; No publishes theirs as a separate competition.
 */
export function DuplicatePrompt({
  match,
  onYes,
  onNo,
  busy = false,
}: {
  match: Pick<PossibleMatch, "id" | "slug" | "title" | "confidence">;
  onYes: (competitionId: string) => void;
  onNo: () => void;
  busy?: boolean;
}) {
  const sure = match.confidence === "same";
  return (
    <section aria-labelledby="dup-title" className="bg-turf text-chalk rounded-xl p-5">
      <h2 id="dup-title" className="text-2xl font-bold">
        Same competition?
      </h2>
      <p className="mt-2">
        {sure ? "This looks like one we already list: " : "This might be one we already list: "}
        <strong>{match.title}</strong>
      </p>
      <p className="mt-1 text-sm">
        <Link
          href={`/game/${match.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-chalk-muted underline"
        >
          Check the existing listing<span className="sr-only"> (opens in a new tab)</span>
        </Link>
      </p>
      <p className="text-chalk-muted mt-3 text-sm">
        If it is the same one, we add your confirmation to it instead of creating a duplicate.
        Confirmations help other students trust a listing.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant={sure ? "primary" : "secondary"}
          loading={busy}
          onClick={() => onYes(match.id)}
        >
          Yes, same competition
        </Button>
        <Button
          variant="ghost"
          className="text-chalk hover:bg-turf-light"
          disabled={busy}
          onClick={onNo}
        >
          No, it is a different one
        </Button>
      </div>
    </section>
  );
}
