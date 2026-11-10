"use client";
import { Button, useToast } from "@/components/ui";
import type { EntryRow } from "@/lib/entries";
import { formatResumeList } from "@/lib/resume";

/** Copy or download the résumé-ready list of results. */
export function ResumeExport({ entries }: { entries: EntryRow[] }) {
  const toast = useToast();
  const text = () =>
    formatResumeList(
      entries.map((e) => ({
        title: e.competition?.title ?? "Competition",
        result: e.result,
        season: e.season,
        team_name: e.team_name,
        verified_by_host: e.verified_by_host,
      })),
    );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      toast.show("Résumé list copied", "success");
    } catch {
      toast.show("Could not copy. Use Download instead.", "error");
    }
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([text() + "\n"], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "comet-arena-competitions.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Export for your résumé">
      <Button variant="secondary" onClick={() => void copy()}>
        Copy résumé list
      </Button>
      <Button variant="ghost" onClick={download}>
        Download .txt
      </Button>
    </div>
  );
}
