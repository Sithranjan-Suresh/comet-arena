import type { Mailer, MailMessage } from "../types";

export interface MockMailer extends Mailer {
  /** Every message actually "delivered" (idempotent keys are delivered once). */
  sent: (MailMessage & { id: string })[];
}

/**
 * In-memory mailer for mock mode and tests. Mirrors Resend's idempotency: the same key returns the
 * original message id and sends nothing new.
 */
export function createMockMailer(
  opts: { failFor?: (m: MailMessage) => Error | null } = {},
): MockMailer {
  const sent: MockMailer["sent"] = [];
  const byKey = new Map<string, string>();
  return {
    sent,
    async send(msg) {
      const err = opts.failFor?.(msg);
      if (err) throw err;
      if (msg.idempotencyKey && byKey.has(msg.idempotencyKey))
        return { id: byKey.get(msg.idempotencyKey)! };
      const id = `mock_email_${sent.length + 1}`;
      sent.push({ ...msg, id });
      if (msg.idempotencyKey) byKey.set(msg.idempotencyKey, id);
      if (process.env.MOCK_EMAIL_LOG === "1")
        console.log(`[mock email] to=${msg.to} subject="${msg.subject}"`);
      return { id };
    },
  };
}
