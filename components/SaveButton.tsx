"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRequireAuth } from "@/components/auth/useRequireAuth";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SAVES_KEY, fetchSavedIds, setSavedOnServer, withSaved } from "@/lib/saves-client";

/**
 * Save / Unsave toggle. State is shared through one query cache, so toggling on a card updates the
 * Game Day button (and vice versa) without a reload. Signed out: remembers the save, sends the user
 * to sign in, and completes it afterwards (Task 34).
 */
export function SaveButton({
  competitionId,
  title,
  className,
}: {
  competitionId: string;
  /** Used in the accessible name, e.g. "Save AIS Fall Case Competition". */
  title: string;
  className?: string;
}) {
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: ids } = useQuery({
    queryKey: SAVES_KEY,
    queryFn: fetchSavedIds,
    enabled: !!user,
    staleTime: 60_000,
  });
  const saved = !!ids?.includes(competitionId);

  const mutation = useMutation({
    mutationFn: (next: boolean) => setSavedOnServer(competitionId, next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: SAVES_KEY });
      const previous = qc.getQueryData<string[]>(SAVES_KEY);
      qc.setQueryData<string[]>(SAVES_KEY, (cur) => withSaved(cur, competitionId, next));
      return { previous };
    },
    onError: (_e, next, ctx) => {
      qc.setQueryData(SAVES_KEY, ctx?.previous);
      toast.show(
        next ? "Could not save. Please try again." : "Could not remove. Please try again.",
        "error",
      );
    },
    onSuccess: (_d, next) => {
      if (next) toast.show("Saved. Its deadlines are on your schedule.", "success");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: SAVES_KEY });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
    },
  });

  function onClick() {
    if (!requireAuth({ type: "save", competitionId })) return;
    mutation.mutate(!saved);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={`${saved ? "Unsave" : "Save"} ${title}`}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors",
        saved ? "bg-utd-orange text-ink" : "bg-chalk text-ink hover:bg-court-dark",
        className,
      )}
    >
      <span aria-hidden="true">{saved ? "★" : "☆"}</span>
      {saved ? "Saved" : "Save"}
    </button>
  );
}
