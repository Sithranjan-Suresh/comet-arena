"use client";
import { useEffect, useRef } from "react";
import { getPendingHandler, takePendingAction } from "@/lib/pending-action";
import { useToast } from "@/components/ui";
import { useAuth } from "./AuthProvider";

/** Mounted once in the shell. When a user is present, completes any action saved before sign-in. */
export function PendingActionRunner() {
  const { user } = useAuth();
  const toast = useToast();
  const done = useRef(false);

  useEffect(() => {
    if (!user || done.current) return;
    done.current = true; // run at most once per page load, even in StrictMode
    const action = takePendingAction();
    if (!action) return;
    const handler = getPendingHandler(action.type);
    if (!handler) return;
    handler(action)
      .then((message) => toast.show(message || "Done.", "success"))
      .catch(() => toast.show("We could not finish that action. Please try again.", "error"));
  }, [user, toast]);

  return null;
}
