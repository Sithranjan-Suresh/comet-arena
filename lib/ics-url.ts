/** Client-safe helpers for the personal calendar feed URL (no Node APIs). */
export const ICS_TOKEN_PATTERN = /^[0-9a-f]{48}$/;

export function icsFeedPath(token: string): string {
  return `/api/calendar/${token}.ics`;
}

/** Absolute feed URL for a user's token. */
export function icsFeedUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}${icsFeedPath(token)}`;
}

/** webcal:// opens the native "subscribe to calendar" flow on iOS/macOS (and most desktop clients). */
export function webcalUrl(httpUrl: string): string {
  return httpUrl.replace(/^https?:\/\//i, "webcal://");
}

/**
 * Google Calendar's subscribe-by-URL flow. Google fetches the feed from its servers, so the URL must be
 * publicly reachable (not localhost).
 */
export function googleCalendarSubscribeUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(feedUrl))}`;
}

export function outlookSubscribeUrl(feedUrl: string, name = "Comet Arena deadlines"): string {
  return `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(name)}`;
}

/** True for URLs a remote service (Google, Outlook) cannot reach. */
export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "::1" ||
      h.endsWith(".local") ||
      h.endsWith(".localhost")
    );
  } catch {
    return true;
  }
}
