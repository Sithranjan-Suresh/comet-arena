"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRequireAuth } from "@/components/auth/useRequireAuth";
import { Button, Dialog, Input, Select, useToast } from "@/components/ui";
import { RESULT_LABEL, RESULT_ORDER, fetchEntries, saveEntry } from "@/lib/entries-client";
import type { EntryResult } from "@/lib/schemas";

/** "I competed": log your result for this competition (private, unverified, shown on your Player Card). */
export function AddEntryDialog({
  competitionId,
  title,
  stageCount,
}: {
  competitionId: string;
  title: string;
  stageCount: number;
}) {
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: entries } = useQuery({
    queryKey: ["entries"],
    queryFn: fetchEntries,
    enabled: !!user,
    staleTime: 60_000,
  });
  const existing = entries?.find((e) => e.competition_id === competitionId);

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          if (requireAuth()) setOpen(true);
        }}
      >
        {existing ? "Edit my result" : "I competed"}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={existing ? "Edit your result" : "Add to your Player Card"}
      >
        {open && (
          <EntryForm
            key={existing?.id ?? "new"}
            competitionId={competitionId}
            title={title}
            maxRounds={Math.max(stageCount - 1, 0) || 10}
            initial={
              existing
                ? {
                    result: existing.result,
                    rounds: existing.rounds_advanced,
                    team: existing.team_name,
                  }
                : undefined
            }
            onCancel={() => setOpen(false)}
            onSaved={() => {
              setOpen(false);
              void qc.invalidateQueries({ queryKey: ["entries"] });
              toast.show("Saved to your Player Card.", "success");
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function EntryForm({
  competitionId,
  title,
  maxRounds,
  initial,
  onCancel,
  onSaved,
}: {
  competitionId: string;
  title: string;
  maxRounds: number;
  initial?: { result: EntryResult; rounds: number; team: string };
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [result, setResult] = useState<EntryResult>(initial?.result ?? "participated");
  const [rounds, setRounds] = useState(String(initial?.rounds ?? 0));
  const [team, setTeam] = useState(initial?.team ?? "");
  const [error, setError] = useState<string>();

  const save = useMutation({
    mutationFn: () =>
      saveEntry({
        competition_id: competitionId,
        result,
        rounds_advanced: Number(rounds),
        team_name: team.trim(),
      }),
    onSuccess: (r) => (r.ok ? onSaved() : setError(r.message)),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(rounds);
    if (!Number.isInteger(n) || n < 0 || n > maxRounds)
      return setError(`Rounds advanced must be a whole number from 0 to ${maxRounds}.`);
    setError(undefined);
    save.mutate();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-ink-muted text-sm">{title}</p>
      <Select
        label="How did it go?"
        value={result}
        onChange={(e) => setResult(e.target.value as EntryResult)}
      >
        {RESULT_ORDER.map((r) => (
          <option key={r} value={r}>
            {RESULT_LABEL[r]}
          </option>
        ))}
      </Select>
      <Input
        label="Rounds advanced"
        type="number"
        min={0}
        max={maxRounds}
        value={rounds}
        onChange={(e) => setRounds(e.target.value)}
        hint="0 if you did not get past the first round."
      />
      <Input
        label="Team name (optional)"
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        maxLength={80}
      />
      <p className="text-ink-muted text-xs">
        Only you can see this for now. It is marked <strong>unverified</strong> until a host
        confirms results.{" "}
        <Link href="/me" className="underline">
          See your Player Card
        </Link>
      </p>
      {error && (
        <p role="alert" className="text-critical text-sm font-medium">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
