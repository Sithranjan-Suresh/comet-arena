import { safeExternalUrl } from "@/lib/format";

/** Instagram profile URL for a handle, or null when the handle is not a plausible one. */
export function instagramUrl(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const h = handle.replace(/^@/, "").trim().toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? `https://www.instagram.com/${h}/` : null;
}

/** Discord invite/server link: https only, and only discord.com / discord.gg hosts. */
export function discordUrl(url: string | null | undefined): string | null {
  const safe = safeExternalUrl(url);
  if (!safe) return null;
  const u = new URL(safe);
  if (u.protocol !== "https:") return null;
  return u.hostname === "discord.gg" ||
    u.hostname === "discord.com" ||
    u.hostname.endsWith(".discord.com")
    ? safe
    : null;
}
