import { z } from "zod";
import type { PushPayload, PushSender, PushSubscriptionData } from "@/lib/sources";

export const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(1000)
    .refine((u) => u.startsWith("https://"), { message: "Push endpoints are https" }),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

export interface StoredSubscription {
  id: string;
  sub: PushSubscriptionData;
}
export interface PushStore {
  listFor(userId: string): Promise<StoredSubscription[]>;
  remove(id: string): Promise<void>;
}

export interface PushResult {
  delivered: number;
  removed: number;
  failed: number;
}

/** Send to every browser a student enabled. Dead subscriptions (unsubscribed, expired) are deleted as they are found. */
export async function pushToUser(
  deps: { sender: PushSender; store: PushStore },
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const out: PushResult = { delivered: 0, removed: 0, failed: 0 };
  for (const s of await deps.store.listFor(userId)) {
    try {
      const r = await deps.sender.send(s.sub, payload);
      if (r === "ok") out.delivered++;
      else {
        await deps.store.remove(s.id);
        out.removed++;
      }
    } catch {
      out.failed++; // transient: keep the subscription, try again next time
    }
  }
  return out;
}

/** What a deadline warning says on a lock screen. */
export function warningPush(args: {
  title: string;
  stageName: string;
  window: "d7" | "d1";
  slug: string;
}): PushPayload {
  const when = args.window === "d1" ? "tomorrow" : "in 7 days";
  return {
    title: `${args.stageName} closes ${when}`,
    body: args.title,
    url: `/game/${args.slug}`,
    tag: `warn:${args.slug}:${args.window}`,
  };
}
