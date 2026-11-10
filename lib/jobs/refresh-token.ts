export interface RefreshDeps {
  currentToken: string;
  /** Exchanges the current long-lived token for a fresh one. */
  exchange(token: string): Promise<{ token: string; expiresInSec: number | null }>;
  /** Stores the new token (GitHub Actions secret). Returns false when write-back is not configured. */
  writeBack(token: string): Promise<boolean>;
  alert(message: string): Promise<void>;
  dryRun?: boolean;
  log?: (event: string, data?: Record<string, unknown>) => void;
}

export interface RefreshResult {
  refreshed: boolean;
  written_back: boolean;
  expires_in_days: number | null;
  dry_run: boolean;
}

/**
 * Monthly: refresh the Meta long-lived token (valid ~60 days). The new value never goes into logs or
 * email. If it cannot be written back to the secret store, the admin is told to rotate it manually.
 */
export async function runRefreshToken(deps: RefreshDeps): Promise<RefreshResult> {
  const log = deps.log ?? (() => {});
  if (deps.dryRun) {
    log("dry_run", {
      would: [
        "POST oauth/access_token (grant_type=fb_exchange_token)",
        "PUT repo secret META_LONG_LIVED_TOKEN",
      ],
    });
    return { refreshed: false, written_back: false, expires_in_days: null, dry_run: true };
  }
  if (!deps.currentToken) throw new Error("META_LONG_LIVED_TOKEN is not set; nothing to refresh");

  const fresh = await deps.exchange(deps.currentToken);
  const days = fresh.expiresInSec ? Math.floor(fresh.expiresInSec / 86400) : null;
  const written = await deps.writeBack(fresh.token).catch((e) => {
    log("write_back_failed", { error: String((e as Error).message ?? e) });
    return false;
  });
  if (!written)
    await deps.alert(
      `The Meta token was refreshed${days ? ` (valid ~${days} days)` : ""} but could not be saved to GitHub secrets automatically. ` +
        `Generate a new long-lived token in the Meta developer console and update META_LONG_LIVED_TOKEN by hand.`,
    );
  log("refreshed", { written_back: written, expires_in_days: days });
  return { refreshed: true, written_back: written, expires_in_days: days, dry_run: false };
}

/** Facebook Login long-lived token exchange. */
export function metaExchange(app: { id: string; secret: string }, fetchImpl: typeof fetch = fetch) {
  return async (token: string) => {
    const url = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(app.id)}&client_secret=${encodeURIComponent(app.secret)}&fb_exchange_token=${encodeURIComponent(token)}`;
    const res = await fetchImpl(url);
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!res.ok || !body.access_token)
      throw new Error(`Meta token exchange failed: ${body.error?.message ?? res.status}`);
    return { token: body.access_token, expiresInSec: body.expires_in ?? null };
  };
}
