"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { loginPathFor } from "@/lib/auth/routes";
import { type PendingAction, savePendingAction } from "@/lib/pending-action";
import { useAuth } from "./AuthProvider";

/**
 * `requireAuth(action?)` returns true when the user is signed in. Otherwise it remembers the
 * action, sends the user to /login (returning to this page), and returns false. After sign-in the
 * PendingActionRunner completes the action.
 */
export function useRequireAuth() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  return useCallback(
    (action?: PendingAction): boolean => {
      if (user) return true;
      if (action) savePendingAction(action);
      router.push(loginPathFor(pathname, search ? `?${search}` : ""));
      return false;
    },
    [user, router, pathname, search],
  );
}
