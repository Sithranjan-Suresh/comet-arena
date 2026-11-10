import {
  type ClosingStage,
  type NewListing,
  closingSoonMessage,
  newListingsMessage,
} from "@/lib/notify/discord";
import type { DiscordSender } from "@/lib/sources";

export interface NotifyDiscordStore {
  newListings(since: Date): Promise<NewListing[]>;
  closingStages(from: Date, to: Date): Promise<ClosingStage[]>;
  /** Keys already posted to this channel. */
  sentKeys(keys: string[]): Promise<Set<string>>;
  markSent(keys: string[]): Promise<void>;
}

export interface NotifyDiscordSummary {
  new_posted: number;
  closing_posted: number;
  skipped_already_posted: number;
  messages: number;
}

const HOUR = 3_600_000;

/**
 * Daily channel alerts: new competitions from the last day, and stages closing in the next 2 days.
 * Every item is posted at most once (ledger), a failed post is retried on the next run, and a quiet day posts nothing.
 */
export async function runNotifyDiscord(deps: {
  store: NotifyDiscordStore;
  discord: DiscordSender;
  appUrl: string;
  now?: Date;
}): Promise<NotifyDiscordSummary> {
  const now = deps.now ?? new Date();
  const s: NotifyDiscordSummary = {
    new_posted: 0,
    closing_posted: 0,
    skipped_already_posted: 0,
    messages: 0,
  };

  const fresh = await deps.store.newListings(new Date(now.getTime() - 26 * HOUR));
  const freshKeys = fresh.map((i) => `new:${i.id}`);
  const doneFresh = await deps.store.sentKeys(freshKeys);
  const toPost = fresh.filter((i) => !doneFresh.has(`new:${i.id}`));
  s.skipped_already_posted += fresh.length - toPost.length;
  for (let i = 0; i < toPost.length; i += 5) {
    const batch = toPost.slice(i, i + 5);
    await deps.discord.post(newListingsMessage(batch, deps.appUrl));
    await deps.store.markSent(batch.map((b) => `new:${b.id}`));
    s.new_posted += batch.length;
    s.messages++;
  }

  const closing = await deps.store.closingStages(now, new Date(now.getTime() + 48 * HOUR));
  const doneClosing = await deps.store.sentKeys(closing.map((c) => `closing:${c.stageId}`));
  const toClose = closing.filter((c) => !doneClosing.has(`closing:${c.stageId}`));
  s.skipped_already_posted += closing.length - toClose.length;
  if (toClose.length > 0) {
    await deps.discord.post(closingSoonMessage(toClose, deps.appUrl));
    await deps.store.markSent(toClose.map((c) => `closing:${c.stageId}`));
    s.closing_posted = toClose.length;
    s.messages++;
  }
  return s;
}
