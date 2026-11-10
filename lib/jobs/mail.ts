import type { Mailer } from "@/lib/sources";
import { SourceError } from "@/lib/sources";

export const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retry rate limits, timeouts and outages with backoff (honoring Retry-After); permanent errors throw at once. */
export async function sendWithRetry(
  mailer: Mailer,
  msg: Parameters<Mailer["send"]>[0],
  delays: number[],
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await mailer.send(msg);
      return;
    } catch (e) {
      const retryable =
        e instanceof SourceError &&
        (e.kind === "rate_limit" || e.kind === "unavailable" || e.kind === "timeout");
      if (!retryable || attempt >= delays.length) throw e;
      await sleep(e.retryAfterMs ? Math.max(e.retryAfterMs, delays[attempt]) : delays[attempt]);
    }
  }
}
