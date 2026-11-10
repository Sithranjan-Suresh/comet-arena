// Daily job (8 AM CT): post new competitions and closing-soon deadlines to the Discord channel.
//   npm run job:notify-discord          (SOURCES_MODE=live and DISCORD_WEBHOOK_URL required for a real post)
//   npm run job:notify-discord -- --test   send a single test message and exit
import { runNotifyDiscord } from "../lib/jobs/notify-discord";
import { TEST_MESSAGE } from "../lib/notify/discord";
import { getSources } from "../lib/sources";
import { runCli } from "./lib/run";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

await runCli("notify-discord", async (_ctx, db) => {
  const { discord } = getSources();
  if (process.argv.includes("--test")) {
    await discord.post(TEST_MESSAGE);
    return { test: "sent" };
  }
  return {
    ...(await runNotifyDiscord({
      discord,
      appUrl,
      store: {
        async newListings(since) {
          const { data, error } = await db
            .from("competitions")
            .select("id,slug,title,host_name,categories,created_at,stages(deadline_at)")
            .in("status", ["live", "unverified"])
            .gte("created_at", since.toISOString())
            .order("created_at");
          if (error) throw error;
          return (data ?? []).map((c) => ({
            id: c.id,
            slug: c.slug,
            title: c.title,
            host: c.host_name,
            categories: c.categories ?? [],
            firstDeadline:
              ((c.stages ?? []) as { deadline_at: string }[]).map((s) => s.deadline_at).sort()[0] ??
              null,
          }));
        },
        async closingStages(from, to) {
          const { data, error } = await db
            .from("stages")
            .select("id,name,deadline_at,competition:competitions(slug,title,status)")
            .gte("deadline_at", from.toISOString())
            .lte("deadline_at", to.toISOString())
            .order("deadline_at");
          if (error) throw error;
          return (data ?? []).flatMap((s) => {
            const c = (Array.isArray(s.competition) ? s.competition[0] : s.competition) as {
              slug: string;
              title: string;
              status: string;
            } | null;
            return c && c.status !== "past" && c.status !== "rejected"
              ? [
                  {
                    stageId: s.id,
                    stageName: s.name,
                    deadline: s.deadline_at,
                    title: c.title,
                    slug: c.slug,
                  },
                ]
              : [];
          });
        },
        async sentKeys(keys) {
          if (keys.length === 0) return new Set<string>();
          const { data, error } = await db
            .from("outbound_notifications")
            .select("key")
            .eq("channel", "discord")
            .in("key", keys);
          if (error) throw error;
          return new Set((data ?? []).map((r) => r.key));
        },
        async markSent(keys) {
          const { error } = await db.from("outbound_notifications").upsert(
            keys.map((key) => ({ channel: "discord", key })),
            { onConflict: "channel,key" },
          );
          if (error) throw error;
        },
      },
    })),
  };
});
