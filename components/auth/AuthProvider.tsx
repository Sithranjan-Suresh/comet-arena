"use client";
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export interface AuthUser {
  id: string;
  email: string | null;
}
interface AuthState {
  user: AuthUser | null;
  /** True until the session has been read from the browser (first paint is auth-neutral). */
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: false });
export const useAuth = () => useContext(AuthContext);

/**
 * Resolves the session on the client so shell pages stay statically cacheable (ISR). This state is
 * for UI only: every protected page, route handler and RLS policy still verifies the user on the
 * server. `initialUser` exists for tests and for pages that already know the user.
 */
export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser?: AuthUser | null;
  children: ReactNode;
}) {
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const [user, setUser] = useState<AuthUser | null>(initialUser ?? null);
  const [loading, setLoading] = useState(initialUser === undefined && configured);

  useEffect(() => {
    if (!configured) return;
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => {
      // Fires immediately with INITIAL_SESSION, then on sign-in/out/refresh.
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [configured]);

  const value = useMemo(() => ({ user, loading }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
