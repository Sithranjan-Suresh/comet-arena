import { SourceError } from "../errors";
import type { DiscordMessage, DiscordSender } from "../types";

export interface DiscordOptions {
  webhookUrl: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
}

/** Discord only accepts webhook URLs on its own domain; refuse anything else so a typo cannot post elsewhere. */
export const isDiscordWebhook = (u: string) =>
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(u);

export function createDiscord(o: DiscordOptions): DiscordSender {
  const doFetch = o.fetchImpl ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  return {
    async post(message: DiscordMessage) {
      if (!isDiscordWebhook(o.webhookUrl))
        throw new SourceError(
          "discord",
          "unavailable",
          "DISCORD_WEBHOOK_URL is missing or not a Discord webhook",
        );
      for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
          res = await doFetch(o.webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            // No @everyone/@here pings, whatever the content says.
            body: JSON.stringify({
              ...message,
              allowed_mentions: { parse: [] },
              username: "Comet Arena",
            }),
          });
        } catch {
          throw new SourceError("discord", "unavailable", "request failed");
        }
        if (res.ok) return;
        if (res.status === 429 && attempt < (o.retries ?? 2)) {
          const wait = Number((await res.json().catch(() => ({})))?.retry_after ?? 1) * 1000;
          await sleep(Math.min(Math.max(wait, 250), 10_000));
          continue;
        }
        throw new SourceError(
          "discord",
          res.status === 429 ? "rate_limit" : "unavailable",
          `Discord returned ${res.status}`,
        );
      }
    },
  };
}
