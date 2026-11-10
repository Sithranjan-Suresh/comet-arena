"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Dialog, Input, Textarea, useToast } from "@/components/ui";
import { chicagoLocalFromIso, isoFromChicagoLocal } from "@/lib/submit/form";

export interface OfficeListingData {
  id: string;
  slug: string;
  title: string;
  status: string;
  description: string | null;
  prize: string | null;
  location: string | null;
  register_url: string | null;
  stages: { name: string; deadline_at: string }[];
}

async function send(url: string, method: string, body: unknown) {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, json: { message: "Network problem. Try again." } };
  }
}

interface Report {
  matched: number;
  unmatched: number;
  skipped: { line: number; reason: string; value?: string }[];
}

export function OfficeListing({ listing }: { listing: OfficeListingData }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [stageValues, setStageValues] = useState(() =>
    listing.stages.map((s) => chicagoLocalFromIso(s.deadline_at)),
  );

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const patch: Record<string, unknown> = {};
    const cur: Record<string, string> = {
      title: listing.title,
      description: listing.description ?? "",
      prize: listing.prize ?? "",
      location: listing.location ?? "",
      register_url: listing.register_url ?? "",
    };
    for (const k of ["title", "description", "prize", "location", "register_url"])
      if (text(k) !== cur[k]) patch[k] = k === "title" ? text(k) : text(k) === "" ? null : text(k);

    const stages: { name: string; deadline_at: string }[] = [];
    let stagesChanged = false;
    for (const [i, s] of listing.stages.entries()) {
      const iso = isoFromChicagoLocal(stageValues[i]);
      if (!iso) return toast.show(`Check the date for “${s.name}”.`, "error");
      if (new Date(iso).getTime() !== new Date(s.deadline_at).getTime()) stagesChanged = true;
      stages.push({ name: s.name, deadline_at: iso });
    }
    if (stagesChanged) patch.stages = stages;
    if (Object.keys(patch).length === 0) return toast.show("Nothing changed.", "info");

    setBusy(true);
    const r = await send(`/api/office/competitions/${listing.id}`, "PATCH", patch);
    setBusy(false);
    if (r.ok) {
      toast.show(
        r.json.dates_changed
          ? "Saved. Students who saved this were told about the new dates."
          : "Saved. This listing is now verified.",
        "success",
      );
      setEditing(false);
      router.refresh();
    } else toast.show(String(r.json.message ?? "Something went wrong."), "error");
  }

  async function uploadResults(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setReport(null);
    const r = await send(`/api/office/competitions/${listing.id}/results`, "POST", { csv });
    setBusy(false);
    if (r.ok) {
      setReport(r.json as unknown as Report);
      toast.show("Results uploaded", "success");
      router.refresh();
    } else {
      toast.show(String(r.json.message ?? "Something went wrong."), "error");
      if (Array.isArray(r.json.skipped))
        setReport({ matched: 0, unmatched: 0, skipped: r.json.skipped as Report["skipped"] });
    }
  }

  return (
    <li className="bg-chalk space-y-2 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <Link href={`/game/${listing.slug}`} className="font-semibold underline">
            {listing.title}
          </Link>{" "}
          <span className="text-ink-muted text-sm">({listing.status})</span>
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setUploading(true)}>
            Upload results
          </Button>
        </div>
      </div>

      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${listing.title}`}
        className="w-[min(94vw,40rem)]"
      >
        <form onSubmit={saveEdit} className="space-y-3">
          <Input name="title" label="Title" defaultValue={listing.title} />
          <Textarea
            name="description"
            label="Description"
            defaultValue={listing.description ?? ""}
            rows={3}
          />
          <Input name="prize" label="Prize" defaultValue={listing.prize ?? ""} />
          <Input name="location" label="Location" defaultValue={listing.location ?? ""} />
          <Input
            name="register_url"
            label="Registration link"
            defaultValue={listing.register_url ?? ""}
          />
          {listing.stages.map((s, i) => (
            <Input
              key={s.name}
              type="datetime-local"
              label={`${s.name} (Central Time)`}
              value={stageValues[i]}
              onChange={(e) =>
                setStageValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))
              }
            />
          ))}
          <p className="text-ink-muted text-sm">
            Saving marks this listing verified. Changing a date emails students who saved it.
          </p>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={uploading}
        onClose={() => setUploading(false)}
        title={`Results for ${listing.title}`}
        className="w-[min(94vw,40rem)]"
      >
        <form onSubmit={uploadResults} className="space-y-3">
          <Textarea
            label="CSV: email, result, rounds (optional), points (optional), team (optional)"
            hint="Result: 1st, 2nd, 3rd, finalist, advanced or participated. Students with an account get a verified entry on their Player Card."
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
          />
          <div className="flex gap-2">
            <Button type="submit" loading={busy} disabled={csv.trim() === ""}>
              Upload
            </Button>
            <Button type="button" variant="ghost" onClick={() => setUploading(false)}>
              Close
            </Button>
          </div>
          {report && (
            <div role="status" className="space-y-1 text-sm">
              <p>
                Added {report.matched} verified result{report.matched === 1 ? "" : "s"}.{" "}
                {report.unmatched} row{report.unmatched === 1 ? " has" : "s have"} no Comet Arena
                account yet.
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
      </Dialog>
    </li>
  );
}
