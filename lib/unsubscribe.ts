import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Signed, non-expiring unsubscribe tokens. They must work forever (people unsubscribe from old emails),
 * so there is no expiry; safety comes from the HMAC and from every action being low-risk and reversible.
 */
export const unsubscribePayloadSchema = z.discriminatedUnion("k", [
  z.object({ k: z.literal("comp"), u: z.string().uuid(), c: z.string().uuid() }),
  z.object({ k: z.literal("warnings"), u: z.string().uuid() }),
  z.object({ k: z.literal("digest"), u: z.string().uuid() }),
  z.object({ k: z.literal("sub"), e: z.string().email().max(254) }),
]);
export type UnsubscribePayload = z.infer<typeof unsubscribePayloadSchema>;

const b64 = (b: Buffer) => b.toString("base64url");

/** Secret for signing. Never fall back to a guessable key in production. */
export function unsubscribeSecret(env: Record<string, string | undefined> = process.env): string {
  const s = env.UNSUBSCRIBE_SECRET;
  if (s && s.length >= 16) return s;
  if (env.NODE_ENV === "production")
    throw new Error("UNSUBSCRIBE_SECRET (>=16 chars) is required in production");
  return "dev-only-unsubscribe-secret";
}

export function signToken(
  payload: UnsubscribePayload,
  secret: string = unsubscribeSecret(),
): string {
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = b64(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

/** Returns the payload for a valid token, otherwise null (tampered, malformed or wrong secret). */
export function verifyToken(
  token: string,
  secret: string = unsubscribeSecret(),
): UnsubscribePayload | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, sig] = parts;
  const expected = createHmac("sha256", secret).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = unsubscribePayloadSchema.safeParse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function unsubscribeUrl(
  appUrl: string,
  payload: UnsubscribePayload,
  secret?: string,
): string {
  return `${appUrl.replace(/\/+$/, "")}/unsubscribe?t=${signToken(payload, secret)}`;
}

/** RFC 8058 one-click headers: mail clients POST to the API endpoint without opening a page. */
export function listUnsubscribeHeaders(
  appUrl: string,
  payload: UnsubscribePayload,
  secret?: string,
): Record<string, string> {
  const api = `${appUrl.replace(/\/+$/, "")}/api/unsubscribe?t=${signToken(payload, secret)}`;
  return { "List-Unsubscribe": `<${api}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}
