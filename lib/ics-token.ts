import { randomBytes } from "node:crypto";

/** 24 random bytes as hex (192 bits). Matches the DB default `encode(gen_random_bytes(24), 'hex')`. */
export function generateIcsToken(): string {
  return randomBytes(24).toString("hex");
}

export const ICS_TOKEN_PATTERN = /^[0-9a-f]{48}$/;

export function icsFeedPath(token: string): string {
  return `/api/calendar/${token}.ics`;
}

/** Absolute https/http feed URL for a user's token. */
export function icsFeedUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}${icsFeedPath(token)}`;
}
