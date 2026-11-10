"use client";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ScoutingFeed } from "./ScoutingFeed";

/**
 * Signed in: the personalized Scouting Report. Everyone else (and while we are still finding out): the
 * server-rendered public page passed as children, so the home page itself stays statically cacheable.
 */
export function HomeSwitch({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (!loading && user) return <ScoutingFeed />;
  return <>{children}</>;
}
