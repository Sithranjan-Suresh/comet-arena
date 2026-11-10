/** Client-safe helpers for the personal calendar feed URL (no Node APIs). */
export const ICS_TOKEN_PATTERN = /^[0-9a-f]{48}$/;

export function icsFeedPath(token: string): string {
  return `/api/calendar/${token}.ics`;
}

/** Absolute feed URL for a user's token. */
export function icsFeedUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}${icsFeedPath(token)}`;
}
