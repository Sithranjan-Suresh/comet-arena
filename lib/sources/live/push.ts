import webpush from "web-push";
import { SourceError } from "../errors";
import type { PushPayload, PushSender, PushSubscriptionData } from "../types";

export interface PushOptions {
  publicKey: string;
  privateKey: string;
  /** mailto: or https: contact for the push service (required by the protocol). */
  subject: string;
  /** Injectable for tests. */
  send?: (
    sub: PushSubscriptionData,
    body: string,
    options: { TTL: number; urgency: "normal" | "high" },
  ) => Promise<unknown>;
}

/** Web Push with VAPID. A 404/410 from the push service means the subscription is dead. */
export function createWebPush(o: PushOptions): PushSender {
  const doSend =
    o.send ??
    ((sub, body, options) => {
      webpush.setVapidDetails(o.subject, o.publicKey, o.privateKey);
      return webpush.sendNotification(sub, body, options);
    });
  return {
    async send(sub, payload: PushPayload) {
      try {
        await doSend(sub, JSON.stringify(payload), { TTL: 86_400, urgency: "normal" });
        return "ok";
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return "gone";
        if (status === 429)
          throw new SourceError("push", "rate_limit", "push service rate limited", 60_000);
        throw new SourceError("push", "unavailable", `push failed${status ? ` (${status})` : ""}`);
      }
    },
  };
}
