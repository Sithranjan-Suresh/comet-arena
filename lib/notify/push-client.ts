/** Browser-side helpers for web push. Kept free of React so the logic is testable. */

export type PushSupport = "unsupported" | "denied" | "default" | "granted";

export function pushSupport(env: {
  Notification?: { permission: string };
  hasServiceWorker: boolean;
  hasPushManager: boolean;
}): PushSupport {
  if (!env.Notification || !env.hasServiceWorker || !env.hasPushManager) return "unsupported";
  const p = env.Notification.permission;
  return p === "denied" ? "denied" : p === "granted" ? "granted" : "default";
}

/** VAPID public keys are URL-safe base64; the browser wants raw bytes. */
export function urlBase64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const padded = (b64 + "=".repeat((4 - (b64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Plain JSON of a PushSubscription, as our API expects. */
export function subscriptionJson(sub: {
  toJSON(): unknown;
}): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  return j.endpoint && j.keys?.p256dh && j.keys?.auth
    ? { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } }
    : null;
}
