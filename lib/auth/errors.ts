import { UTD_EMAIL_MESSAGE } from "./email";

export type AuthErrorCode = "utd_email" | "callback_failed" | "missing_code" | "access_denied";

const MESSAGES: Record<AuthErrorCode, string> = {
  utd_email: UTD_EMAIL_MESSAGE,
  callback_failed: "We could not finish signing you in. Please try again.",
  missing_code: "That sign-in link is invalid or has expired. Request a new one.",
  access_denied: "Sign-in was cancelled.",
};

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return (MESSAGES as Record<string, string>)[code] ?? MESSAGES.callback_failed;
}

/**
 * Map what Supabase puts on the callback URL to one of our codes. When the DB trigger rejects a
 * non-UTD email, GoTrue reports "Database error saving new user" (and may include our message).
 */
export function classifyCallbackError(params: {
  error?: string | null;
  error_description?: string | null;
}): AuthErrorCode | null {
  const desc = (params.error_description ?? "").toLowerCase();
  if (!params.error && !desc) return null;
  if (desc.includes("utdallas") || desc.includes("utd_email") || desc.includes("database error")) {
    return "utd_email";
  }
  if (params.error === "access_denied") return "access_denied";
  return "callback_failed";
}
