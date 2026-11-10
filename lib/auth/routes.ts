/** Route prefixes that require a signed-in user. Everything else (Field, Game Day, org pages) is public. */
export const PROTECTED_PREFIXES = [
  "/schedule",
  "/free-agency",
  "/me",
  "/settings",
  "/onboarding",
  "/report",
  "/office",
  "/admin",
] as const;

export function needsAuth(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Build the login URL path that returns the user to where they were headed. */
export function loginPathFor(pathname: string, search = ""): string {
  const next = `${pathname}${search}`;
  return `/login?next=${encodeURIComponent(next)}`;
}
