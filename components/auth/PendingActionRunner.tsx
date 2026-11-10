"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui";
import { getPendingHandler, takePendingAction } from "@/lib/pending-action";
import { SAVES_KEY } from "@/lib/saves-client";
import { useAuth } from "./AuthProvider";

/** Mounted once in the shell. When a user is present, completes any action saved before sign-in. */
export function PendingActionRunner() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const done = useRef(false);

  useEffect(() => {
    if (!user || done.current) return;
    done.current = true; // run at most once per page load, even in StrictMode
    const action = takePendingAction();
    if (!action) return;
    const handler = getPendingHandler(action.type);
    if (!handler) return;
    handler(action)
      .then((message) => {
        toast.show(message || "Done.", "success");
        // Buttons showing this state must pick up the completed action.
        if (action.type === "save") void qc.invalidateQueries({ queryKey: SAVES_KEY });
      })
      .catch(() => toast.show("We could not finish that action. Please try again.", "error"));
  }, [user, toast, qc]);

  return null;
}
