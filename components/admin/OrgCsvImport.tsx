"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Textarea } from "@/components/ui";

interface Report {
  updated: number;
  unchanged: number;
  skipped: { line: number; reason: string; value?: string }[];
}

export function OrgCsvImport() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/admin/orgs/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const body = (await res.json().catch(() => ({}))) as Report & { message?: string };
      if (!res.ok) setError(body.message ?? "Import failed.");
      else {
        setReport(body);
        router.refresh();
      }
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={run} aria-label="Import handles from CSV" className="space-y-3">
      <Textarea
        label="CSV: club,instagram,account_type (type optional)"
        hint="The club column matches a slug, UTD Clubs slug or exact name. Bad rows are skipped and listed."
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={6}
      />
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="Choose a CSV file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setCsv(await f.text());
        }}
      />
      <div>
        <Button type="submit" loading={busy} disabled={csv.trim() === ""}>
          Import
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-critical">
          {error}
        </p>
      )}
      {report && (
        <div role="status" className="space-y-1 text-sm">
          <p>
            Updated {report.updated}, unchanged {report.unchanged}, skipped {report.skipped.length}.
          </p>
          {report.skipped.length > 0 && (
            <ul className="list-disc pl-5">
              {report.skipped.map((s) => (
                <li key={`${s.line}-${s.reason}`}>
                  Line {s.line}: {s.reason}
                  {s.value ? ` (${s.value})` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
