import type { FeedItem } from "@/lib/feed";

export interface FeedPage {
  items: FeedItem[];
  next_cursor: string | null;
  needs_onboarding: boolean;
}

export async function fetchFeedPage(cursor?: string): Promise<FeedPage> {
  const res = await fetch(`/api/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  return (await res.json()) as FeedPage;
}
