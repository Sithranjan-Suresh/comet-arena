import dns from "node:dns/promises";
import net from "node:net";

/** True for any address that must never be fetched on a user's behalf (SSRF protection). */
export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateV4(ip);
  if (v === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms: judge by the embedded v4 address.
    const mapped = /^(?:::ffff:|::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
    if (mapped) return isPrivateV4(mapped[1]);
    const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return (
      lower === "::" ||
      lower === "::1" ||
      /^f[cd][0-9a-f]{2}:/.test(lower) || // fc00::/7 unique local
      /^fe[89ab][0-9a-f]:/.test(lower) || // fe80::/10 link local
      /^ff[0-9a-f]{2}:/.test(lower) || // multicast
      /^64:ff9b:/.test(lower) // NAT64 can reach v4 private space
    );
  }
  return true; // not an IP at all: refuse
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link local incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) || // 192.0.0.0/24 and 192.0.2.0/24 documentation
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

export class UnsafeUrlError extends Error {
  constructor(readonly reason: string) {
    super(`unsafe url: ${reason}`);
    this.name = "UnsafeUrlError";
  }
}

type Lookup = (host: string) => Promise<{ address: string }[]>;
const defaultLookup: Lookup = (host) => dns.lookup(host, { all: true });

export interface UrlPolicy {
  /** Allow plain http (local development only). */
  allowHttp?: boolean;
  lookup?: Lookup;
}

/** Throws UnsafeUrlError unless the URL is https (or allowed http) and every resolved address is public. */
export async function assertPublicUrl(raw: string, policy: UrlPolicy = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("not a valid URL");
  }
  if (url.protocol !== "https:" && !(policy.allowHttp && url.protocol === "http:")) {
    throw new UnsafeUrlError("only https is allowed");
  }
  if (url.username || url.password) throw new UnsafeUrlError("credentials in URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new UnsafeUrlError("missing host");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new UnsafeUrlError("local hostname");
  }

  // Literal IPs are judged directly; names must resolve, and EVERY address must be public.
  const addresses = net.isIP(host)
    ? [{ address: host }]
    : await (policy.lookup ?? defaultLookup)(host).catch(() => []);
  if (addresses.length === 0) throw new UnsafeUrlError("host does not resolve");
  for (const { address } of addresses) {
    if (isPrivateIp(address)) throw new UnsafeUrlError("resolves to a private address");
  }
  return url;
}

export interface SafeFetchOptions extends UrlPolicy {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  /** Required response content-type prefix, e.g. "image/". */
  accept?: string;
}

/**
 * Fetch a public URL into memory with a size cap, timeout and per-hop validation of redirects.
 * Residual risk: DNS can change between our lookup and fetch (rebinding); mitigated by validating
 * every hop, short timeouts and never returning response bodies to the caller verbatim.
 */
export async function safeFetchBuffer(
  raw: string,
  opts: SafeFetchOptions = {},
): Promise<{ buffer: Buffer; contentType: string; url: string }> {
  const {
    maxBytes = 25 * 1024 * 1024,
    timeoutMs = 8000,
    maxRedirects = 3,
    fetchImpl = fetch,
  } = opts;
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current, opts);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { redirect: "manual", signal: controller.signal });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new UnsafeUrlError("redirect without location");
        current = new URL(loc, url).toString();
        continue;
      }
      if (!res.ok) throw new UnsafeUrlError(`remote responded ${res.status}`);
      const contentType = res.headers.get("content-type") ?? "";
      if (opts.accept && !contentType.toLowerCase().startsWith(opts.accept)) {
        throw new UnsafeUrlError(`unexpected content-type ${contentType || "(none)"}`);
      }
      const declared = Number(res.headers.get("content-length"));
      if (declared > maxBytes) throw new UnsafeUrlError("response too large");
      const buffer = await readCapped(res, maxBytes);
      return { buffer, contentType, url: url.toString() };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new UnsafeUrlError("too many redirects");
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  if (!res.body) return Buffer.from(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UnsafeUrlError("response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
