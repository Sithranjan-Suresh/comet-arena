import { describe, expect, it, vi } from "vitest";
import { UnsafeUrlError, assertPublicUrl, isPrivateIp, safeFetchBuffer } from "@/lib/net/ssrf";

describe("isPrivateIp", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.1.2.3",
    "::ffff:7f00:1",
    "64:ff9b::1",
    "not-an-ip",
  ])("%s is private", (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.15.0.1",
    "172.32.0.1",
    "192.169.0.1",
    "104.18.0.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("%s is public", (ip) => expect(isPrivateIp(ip)).toBe(false));
});

const pub = async () => [{ address: "93.184.216.34" }];

describe("assertPublicUrl", () => {
  it("accepts a normal https URL that resolves publicly", async () => {
    expect((await assertPublicUrl("https://example.com/a.png", { lookup: pub })).hostname).toBe(
      "example.com",
    );
  });

  it.each([
    ["http://example.com/x", "only https"],
    ["ftp://example.com/x", "only https"],
    ["file:///etc/passwd", "only https"],
    ["https://user:pw@example.com/", "credentials"],
    ["https://localhost/x", "local"],
    ["https://service.internal/x", "local"],
    ["https://127.0.0.1/x", "private"],
    ["https://169.254.169.254/latest/meta-data", "private"],
    ["https://[::1]/x", "private"],
    ["https://[::ffff:127.0.0.1]/x", "private"],
    ["not a url", "valid URL"],
  ])("rejects %s", async (url, why) => {
    await expect(assertPublicUrl(url, { lookup: pub })).rejects.toThrow(new RegExp(why, "i"));
  });

  it("rejects a hostname that resolves to a private address, even if another record is public", async () => {
    const mixed = async () => [{ address: "93.184.216.34" }, { address: "10.0.0.7" }];
    await expect(
      assertPublicUrl("https://evil.example/x", { lookup: mixed }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects unresolvable hosts and allows http only when permitted", async () => {
    await expect(
      assertPublicUrl("https://nx.example/", { lookup: async () => [] }),
    ).rejects.toThrow(/resolve/);
    await expect(
      assertPublicUrl("http://example.com/", { lookup: pub, allowHttp: true }),
    ).resolves.toBeInstanceOf(URL);
  });
});

const res = (
  body: string | Uint8Array,
  init: { status?: number; headers?: Record<string, string> } = {},
) => new Response(body as BodyInit, { status: init.status ?? 200, headers: init.headers });

describe("safeFetchBuffer", () => {
  it("returns the body and content type", async () => {
    const fetchImpl = vi.fn(async () => res("hello", { headers: { "content-type": "image/png" } }));
    const out = await safeFetchBuffer("https://example.com/a.png", {
      lookup: pub,
      fetchImpl,
      accept: "image/",
    });
    expect(out.buffer.toString()).toBe("hello");
    expect(out.contentType).toBe("image/png");
  });

  it("revalidates every redirect hop and blocks redirects into private space", async () => {
    const fetchImpl = vi.fn(async () =>
      res("", { status: 302, headers: { location: "https://169.254.169.254/latest" } }),
    );
    await expect(
      safeFetchBuffer("https://example.com/a", { lookup: pub, fetchImpl }),
    ).rejects.toThrow(/private/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows safe redirects but stops after the limit", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n++;
      return n < 3
        ? res("", { status: 301, headers: { location: `/hop${n}` } })
        : res("done", { headers: { "content-type": "text/plain" } });
    });
    expect(
      (
        await safeFetchBuffer("https://example.com/a", { lookup: pub, fetchImpl })
      ).buffer.toString(),
    ).toBe("done");
    const loop = vi.fn(async () => res("", { status: 301, headers: { location: "/again" } }));
    await expect(
      safeFetchBuffer("https://example.com/a", { lookup: pub, fetchImpl: loop, maxRedirects: 2 }),
    ).rejects.toThrow(/redirects/);
  });

  it("rejects wrong content types, oversized bodies and non-2xx responses", async () => {
    await expect(
      safeFetchBuffer("https://example.com/a", {
        lookup: pub,
        accept: "image/",
        fetchImpl: async () => res("x", { headers: { "content-type": "text/html" } }),
      }),
    ).rejects.toThrow(/content-type/);
    await expect(
      safeFetchBuffer("https://example.com/a", {
        lookup: pub,
        maxBytes: 4,
        fetchImpl: async () => res("123456789", { headers: { "content-type": "image/png" } }),
      }),
    ).rejects.toThrow(/too large/);
    await expect(
      safeFetchBuffer("https://example.com/a", {
        lookup: pub,
        fetchImpl: async () => res("nope", { status: 404 }),
      }),
    ).rejects.toThrow(/404/);
  });
});
