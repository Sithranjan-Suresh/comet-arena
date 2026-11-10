"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, useToast } from "@/components/ui";

export function ResolveFlagButton({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/admin/flags/${id}`, { method: "POST" });
          if (res.ok) {
            toast.show("Marked resolved", "success");
            router.refresh();
          } else toast.show("Could not resolve that flag.", "error");
        } catch {
          toast.show("Network problem. Try again.", "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      Resolve
    </Button>
  );
}
