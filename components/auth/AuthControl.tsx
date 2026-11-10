"use client";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

/** Header sign-in / sign-out control. Reserves space while the session loads to avoid layout shift. */
export function AuthControl() {
  const { user, loading } = useAuth();

  if (loading) return <div aria-hidden="true" className="h-11 w-24" />;

  if (user) {
    return (
      <form action="/auth/signout" method="post" className="flex items-center gap-3">
        <span
          className="text-chalk-muted hidden max-w-40 truncate text-sm lg:inline"
          title={user.email ?? ""}
        >
          {user.email}
        </span>
        <button
          type="submit"
          className="border-chalk-muted text-chalk hover:bg-turf-light inline-flex min-h-11 items-center rounded-lg border px-4 font-semibold"
        >
          Sign out
        </button>
      </form>
    );
  }
  return (
    <Link
      href="/login"
      className="bg-utd-orange text-ink inline-flex min-h-11 items-center rounded-lg px-4 font-semibold hover:brightness-95"
    >
      Sign in
    </Link>
  );
}
