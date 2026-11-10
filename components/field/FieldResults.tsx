"use client";
import { useState } from "react";
import { GameCard } from "@/components/GameCard";
import { Button } from "@/components/ui";
import type { GameCardDTO } from "@/lib/schemas";

/** Server-rendered first page plus client-side "Show more" (appends via the public API). */
export function FieldResults({
  initialItems,
  initialCursor,
  queryString,
}: {
  initialItems: GameCardDTO[];
  initialCursor: string | null;
  /** Current filters, without a cursor. */
  queryString: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function more() {
    if (!cursor) return;
    setLoading(true);
    setError(false);
    try {
      const qs = new URLSearchParams(queryString);
      qs.set("cursor", cursor);
      const res = await fetch(`/api/competitions?${qs}`);
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as { items: GameCardDTO[]; next_cursor: string | null };
      setItems((cur) => {
        const seen = new Set(cur.map((c) => c.id));
        return [...cur, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setCursor(page.next_cursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Competitions">
        {items.map((card) => (
          <li key={card.id} className="flex">
            <GameCard card={card} className="w-full" />
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-col items-center gap-2">
        {error && (
          <p role="alert" className="text-critical text-sm font-medium">
            Could not load more competitions.
          </p>
        )}
        {cursor && (
          <Button variant="secondary" loading={loading} onClick={more}>
            {error ? "Try again" : "Show more"}
          </Button>
        )}
      </div>
    </>
  );
}
