/** Same rule as the DB trigger `enforce_utd_email` (migration 007): utdallas.edu or a subdomain. */
const UTD_EMAIL = /^[^@\s]+@([a-z0-9-]+\.)*utdallas\.edu$/i;

export function isUtdEmail(email: string): boolean {
  return UTD_EMAIL.test(email.trim());
}

export const UTD_EMAIL_MESSAGE = "Use your @utdallas.edu address to sign in.";
