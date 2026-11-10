export type SourceErrorKind =
  "timeout" | "rate_limit" | "malformed" | "unavailable" | "not_found" | "not_implemented";

/** Typed failure from any external source so callers can apply the failure-state table (product_spec §5). */
export class SourceError extends Error {
  constructor(
    readonly source: string,
    readonly kind: SourceErrorKind,
    message?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message ?? `${source}: ${kind}`);
    this.name = "SourceError";
  }
}

export const isSourceError = (e: unknown): e is SourceError => e instanceof SourceError;
