import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of the shared secret for internal endpoints (EXTRACT_INTERNAL_KEY).
 * If the secret is not configured the endpoint is locked, never open.
 */
export function verifyInternalKey(
  provided: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || !provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
