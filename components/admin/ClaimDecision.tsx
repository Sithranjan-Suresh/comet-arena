"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, useToast } from "@/components/ui";

export function ClaimDecision({ id, orgName }: { id: string; orgName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "reject");
    try {
      const res = await fetch(`/api/admin/claims/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (res.ok) {
        toast.show(approve ? `Approved for ${orgName}` : "Rejected", "success");
        router.refresh();
      } else toast.show(body.message ?? "Something went wrong.", "error");
    } catch {
      toast.show("Network problem. Try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        loading={busy === "approve"}
        disabled={busy !== null}
        onClick={() => decide(true)}
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="danger"
        loading={busy === "reject"}
        disabled={busy !== null}
        onClick={() => decide(false)}
      >
        Reject
      </Button>
    </div>
  );
}
