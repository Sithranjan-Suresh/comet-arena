"use client";
import { useState } from "react";
import { Button, Dialog, Input } from "@/components/ui";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      if (!res.ok) throw new Error();
      window.location.assign("/");
    } catch {
      setError("We could not delete your account. Please try again or contact us.");
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="danger" className="border-critical rounded-xl border-2 p-5">
      <h2 id="danger" className="text-critical text-2xl font-bold">
        Delete my account
      </h2>
      <p className="text-ink-muted mt-1 text-sm">
        Permanently removes your profile, saved competitions, Free Agency posts and Player Card
        history. This cannot be undone.
      </p>
      <Button variant="danger" className="mt-3" onClick={() => setOpen(true)}>
        Delete my data
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setConfirm("");
        }}
        title="Delete your account?"
      >
        <Input
          label="Type DELETE to confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          error={error}
        />
        <div className="mt-4 flex gap-3">
          <Button variant="danger" disabled={confirm !== "DELETE"} loading={busy} onClick={remove}>
            Permanently delete
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
