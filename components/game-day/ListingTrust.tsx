"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRequireAuth } from "@/components/auth/useRequireAuth";
import { Button, Dialog, Select, Textarea, useToast } from "@/components/ui";
import { CONFIRMATIONS_TO_VERIFY, FLAG_FIELDS, FLAG_LABEL, type FlagField } from "@/lib/flags";

async function post(
  url: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      ok: res.ok,
      status: res.status,
      json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      json: { message: "We could not reach Comet Arena. Check your connection." },
    };
  }
}

/** "This looks right" (only while unverified) and "Report a problem" for any listing. */
export function ListingTrust({
  competitionId,
  title,
  unverified,
  confirmations,
}: {
  competitionId: string;
  title: string;
  unverified: boolean;
  confirmations: number;
}) {
  const requireAuth = useRequireAuth();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<FlagField>("dates");
  const [note, setNote] = useState("");

  async function confirm() {
    if (!requireAuth()) return;
    setBusy(true);
    const r = await post(`/api/confirm/${competitionId}`);
    setBusy(false);
    if (r.ok) {
      setConfirmed(true);
      toast.show(
        r.json.status === "live" ? "Thanks, that makes it verified" : "Thanks for confirming",
        "success",
      );
      router.refresh();
    } else toast.show(String(r.json.message ?? "Something went wrong."), "error");
  }

  async function sendFlag(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await post("/api/flags", { competition_id: competitionId, field, note });
    setBusy(false);
    if (r.ok) {
      toast.show("Thanks, we will take a look", "success");
      setOpen(false);
      setNote("");
    } else toast.show(String(r.json.message ?? "Something went wrong."), "error");
  }

  const needed = Math.max(CONFIRMATIONS_TO_VERIFY - confirmations, 0);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {unverified && (
        <Button
          variant="secondary"
          size="sm"
          loading={busy && !open}
          disabled={confirmed}
          onClick={confirm}
        >
          {confirmed ? "Confirmed" : "This looks right"}
        </Button>
      )}
      {unverified && needed > 0 && (
        <span className="text-ink-muted">
          {needed} more confirmation{needed === 1 ? "" : "s"} verifies it
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (requireAuth()) setOpen(true);
        }}
      >
        Report a problem
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Report a problem with ${title}`}>
        <form onSubmit={sendFlag} className="space-y-4">
          <Select
            label="What is wrong?"
            value={field}
            onChange={(e) => setField(e.target.value as FlagField)}
          >
            {FLAG_FIELDS.map((f) => (
              <option key={f} value={f}>
                {FLAG_LABEL[f]}
              </option>
            ))}
          </Select>
          <Textarea
            label="Details (optional)"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              Send
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
