import type { DiscordMessage } from "@/lib/sources";

const ORANGE = 0xe87500;
const GREEN = 0x10372a;

/** Titles and hosts come from the open web: neutralize Discord markdown, mentions and links. */
export function esc(s: string): string {
  return s
    .replace(/[\\*_`~|>[\]()]/g, (c) => `\\${c}`)
    .replace(/@/g, "@​") // no @everyone / @here / user pings
    .replace(/https?:\/\//gi, (m) => m.replace("://", ":​//"))
    .slice(0, 200);
}

export interface NewListing {
  id: string;
  slug: string;
  title: string;
  host: string | null;
  categories: string[];
  firstDeadline: string | null;
}
export interface ClosingStage {
  stageId: string;
  stageName: string;
  deadline: string;
  title: string;
  slug: string;
}

const ct = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** New listings, up to 5 per message (Discord allows 10 embeds; fewer keeps the channel readable). */
export function newListingsMessage(items: NewListing[], appUrl: string): DiscordMessage {
  const base = appUrl.replace(/\/+$/, "");
  return {
    content:
      items.length === 1
        ? "New competition on Comet Arena"
        : `${items.length} new competitions on Comet Arena`,
    embeds: items.slice(0, 5).map((i) => ({
      title: esc(i.title),
      url: `${base}/game/${i.slug}`,
      color: ORANGE,
      description:
        [
          i.host ? `Hosted by ${esc(i.host)}` : null,
          i.firstDeadline ? `First deadline: ${ct(i.firstDeadline)} CT` : null,
        ]
          .filter(Boolean)
          .join("\n") || undefined,
      fields: i.categories.length
        ? [
            {
              name: "Category",
              value: esc(i.categories.map((c) => c.replace(/_/g, " ")).join(", ")),
              inline: true,
            },
          ]
        : undefined,
    })),
  };
}

/** One digest of everything closing soon. */
export function closingSoonMessage(items: ClosingStage[], appUrl: string): DiscordMessage {
  const base = appUrl.replace(/\/+$/, "");
  const lines = items
    .slice(0, 15)
    .map(
      (s) =>
        `**${esc(s.stageName)}** · [${esc(s.title)}](${base}/game/${s.slug}) · ${ct(s.deadline)} CT`,
    );
  return {
    embeds: [
      {
        title: "Closing in the next 2 days",
        color: GREEN,
        description:
          lines.join("\n") + (items.length > 15 ? `\n…and ${items.length - 15} more` : ""),
      },
    ],
  };
}

export const TEST_MESSAGE: DiscordMessage = {
  content: "Comet Arena test message. If you can read this, channel alerts are connected.",
};
