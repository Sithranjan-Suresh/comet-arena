"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Select, Textarea, useToast } from "@/components/ui";
import { submitReviewAction } from "@/lib/admin/review-client";
import { safeExternalUrl } from "@/lib/format";

export interface ReviewCardItem {
  id: string;
  kind: "low_confidence" | "possible_duplicate";
  extraction: {
    title: string | null;
    host: string | null;
    description: string | null;
    prize: string | null;
    location: string | null;
    register_url: string | null;
    confidence: number;
    stages: { name: string; deadline_at: string }[];
  };
  sourceUrl: string | null;
  flyerUrl: string | null;
  candidates: { id: string; slug: string; title: string; host_name: string | null }[];
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });

export function ReviewCard({ item }: { item: ReviewCardItem }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(item.candidates[0]?.id ?? "");
  const x = item.extraction;
  const flyer = safeExternalUrl(item.flyerUrl);
  const source = safeExternalUrl(item.sourceUrl);

  async function run(action: Parameters<typeof submitReviewAction>[1]) {
    setBusy(true);
    const r = await submitReviewAction(item.id, action);
    setBusy(false);
    toast.show(r.message, r.ok ? "success" : "error");
    if (r.ok) router.refresh();
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const edits: Record<string, string | null> = {};
    for (const k of [
      "title",
      "host",
      "description",
      "prize",
      "location",
      "register_url",
    ] as const) {
      const v = text(k);
      if (v !== (x[k] ?? "")) edits[k] = v === "" ? null : v;
    }
    if (Object.keys(edits).length === 0)
      return toast.show("Nothing changed. Use Approve instead.", "info");
    await run({ action: "edit", edits });
  }

  return (
    <article
      aria-label={x.title ?? "Untitled"}
      className="bg-chalk grid gap-4 rounded-xl p-5 md:grid-cols-[minmax(0,260px)_1fr]"
    >
      <div>
        {flyer ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={flyer}
            alt={`Source flyer for ${x.title ?? "this post"}`}
            className="max-h-96 w-full rounded-lg object-contain"
          />
        ) : (
          <p className="text-ink-muted text-sm">No image on this post.</p>
        )}
        {source && (
          <a
            href={source}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm underline"
          >
            Open original post
          </a>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-ink-muted text-xs font-semibold uppercase">
          {item.kind === "possible_duplicate" ? "Possible duplicate" : "Low confidence"} ·
          confidence {Math.round(x.confidence * 100)}%
        </p>
        {editing ? (
          <form onSubmit={saveEdit} className="space-y-3">
            <Input name="title" label="Title" defaultValue={x.title ?? ""} />
            <Input name="host" label="Host" defaultValue={x.host ?? ""} />
            <Textarea name="description" label="Description" defaultValue={x.description ?? ""} />
            <Input name="prize" label="Prize" defaultValue={x.prize ?? ""} />
            <Input name="location" label="Location" defaultValue={x.location ?? ""} />
            <Input
              name="register_url"
              label="Registration link"
              defaultValue={x.register_url ?? ""}
            />
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>
                Save and publish
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <h3 className="text-xl font-bold">{x.title ?? "Untitled"}</h3>
            <p className="text-ink-muted text-sm">{x.host ?? "Host unknown"}</p>
            <ul className="text-sm">
              {x.stages.map((s) => (
                <li key={`${s.name}-${s.deadline_at}`}>
                  {s.name}: {fmt(s.deadline_at)}
                </li>
              ))}
              {x.stages.length === 0 && <li className="text-ink-muted">No dates found</li>}
            </ul>
            {x.description && <p className="line-clamp-4 text-sm">{x.description}</p>}
          </>
        )}

        {item.candidates.length > 0 && !editing && (
          <div className="space-y-2 rounded-lg border border-current/10 p-3">
            <p className="text-sm font-semibold">Could be the same as:</p>
            <Select label="Merge into" value={target} onChange={(e) => setTarget(e.target.value)}>
              {item.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.host_name ? ` (${c.host_name})` : ""}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              loading={busy}
              disabled={!target}
              onClick={() => run({ action: "merge", merge_into: target })}
            >
              Merge into this listing
            </Button>
          </div>
        )}

        {!editing && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={busy} onClick={() => run({ action: "approve" })}>
              Approve as new
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={busy}
              onClick={() => run({ action: "reject" })}
            >
              Reject
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
