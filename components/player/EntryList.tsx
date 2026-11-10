"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, useToast } from "@/components/ui";
import type { EntryRow } from "@/lib/entries";
import { RESULT_LABEL, removeEntry } from "@/lib/entries-client";

/** Your results, newest first. Self-reported ones say so; edit through the competition's page. */
export function EntryList({ entries }: { entries: EntryRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(e: EntryRow) {
    if (!window.confirm(`Remove ${e.competition?.title ?? "this result"} from your Player Card?`))
      return;
    setBusy(e.id);
    const r = await removeEntry(e.id);
    setBusy(null);
    if (!r.ok) return toast.show(r.message, "error");
    toast.show("Removed.", "success");
    router.refresh();
  }

  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li
          key={e.id}
          className="bg-chalk ring-court-dark flex flex-wrap items-center justify-between gap-3 rounded-lg p-4 ring-1"
        >
          <div className="min-w-0">
            <p className="font-semibold">
              {e.competition ? (
                <Link href={`/game/${e.competition.slug}`} className="underline">
                  {e.competition.title}
                </Link>
              ) : (
                "Competition removed"
              )}
            </p>
            <p className="text-ink-muted text-sm">
              {RESULT_LABEL[e.result]}
              {e.rounds_advanced > 0 &&
                ` · ${e.rounds_advanced} round${e.rounds_advanced === 1 ? "" : "s"} advanced`}
              {e.team_name && ` · ${e.team_name}`} · {e.season}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${e.verified_by_host ? "bg-good text-chalk" : "bg-chalk text-ink ring-warn ring-1"}`}
            >
              {e.verified_by_host ? "✓ Verified by host" : "Unverified"}
            </span>
            {e.competition && (
              <Link
                href={`/game/${e.competition.slug}`}
                className="text-sm font-semibold underline"
              >
                Edit
              </Link>
            )}
            {!e.verified_by_host && (
              <Button
                size="sm"
                variant="ghost"
                loading={busy === e.id}
                onClick={() => void remove(e)}
                aria-label={`Remove ${e.competition?.title ?? "result"}`}
              >
                Remove
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
