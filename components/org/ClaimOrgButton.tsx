"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRequireAuth } from "@/components/auth/useRequireAuth";
import { Button, Dialog, Textarea, buttonClasses, useToast } from "@/components/ui";
import type { ClaimState } from "@/lib/orgs/claims";

/** "Run this organization's Front Office". Hidden for fixture orgs and once the viewer's request is decided. */
export function ClaimOrgButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["org-claim", orgId],
    enabled: !!user && !orgId.startsWith("fixture-"),
    staleTime: 60_000,
    queryFn: async (): Promise<ClaimState> => {
      const res = await fetch(`/api/orgs/${orgId}/claim`, { cache: "no-store" });
      if (!res.ok) throw new Error("claim state");
      return (await res.json()) as ClaimState;
    },
  });

  if (orgId.startsWith("fixture-")) return null;
  if (data?.status === "approved")
    return (
      <Link href="/office" className={buttonClasses("secondary", "sm")}>
        Open your Front Office
      </Link>
    );
  if (data?.status === "pending")
    return (
      <p className="text-ink-muted text-sm">Your request to run {orgName} is waiting for review.</p>
    );
  if (data?.claimed) return null; // someone else holds it

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (res.ok) {
        toast.show("Request sent. An admin will review it.", "success");
        setOpen(false);
        await qc.invalidateQueries({ queryKey: ["org-claim", orgId] });
      } else toast.show(body.message ?? "Something went wrong.", "error");
    } catch {
      toast.show("Network problem. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (requireAuth()) setOpen(true);
        }}
      >
        Are you an officer? Claim this page
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Claim ${orgName}`}>
        <form onSubmit={send} className="space-y-4">
          <p className="text-sm">
            An admin checks every request. Officers can fix their listings and upload results, which
            show as verified on students&apos; Player Cards.
          </p>
          <Textarea
            label="How can we confirm you are an officer? (optional)"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              Send request
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
