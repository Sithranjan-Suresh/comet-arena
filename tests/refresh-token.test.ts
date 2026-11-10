import { describe, expect, it, vi } from "vitest";
import { metaExchange, runRefreshToken } from "@/lib/jobs/refresh-token";

const deps = (over = {}) => ({
  currentToken: "old",
  exchange: vi.fn(async () => ({ token: "new-secret", expiresInSec: 5_184_000 })),
  writeBack: vi.fn(async () => true),
  alert: vi.fn(async () => {}),
  log: vi.fn(),
  ...over,
});

describe("refresh-token", () => {
  it("dry run logs the calls it would make and touches nothing", async () => {
    const d = deps({ dryRun: true });
    const r = await runRefreshToken(d);
    expect(r).toMatchObject({ dry_run: true, refreshed: false });
    expect(d.exchange).not.toHaveBeenCalled();
    expect(d.writeBack).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith(
      "dry_run",
      expect.objectContaining({ would: expect.any(Array) }),
    );
  });

  it("exchanges, writes the new token back and never logs it", async () => {
    const d = deps();
    const r = await runRefreshToken(d);
    expect(r).toMatchObject({ refreshed: true, written_back: true, expires_in_days: 60 });
    expect(d.writeBack).toHaveBeenCalledWith("new-secret");
    expect(JSON.stringify(d.log.mock.calls)).not.toContain("new-secret");
    expect(d.alert).not.toHaveBeenCalled();
  });

  it("no write-back configured (or it fails) alerts the admin to rotate by hand, without the token", async () => {
    for (const writeBack of [
      async () => false,
      async () => {
        throw new Error("403");
      },
    ]) {
      const d = deps({ writeBack });
      const r = await runRefreshToken(d);
      expect(r.written_back).toBe(false);
      expect(d.alert).toHaveBeenCalledTimes(1);
      expect((d.alert.mock.calls[0] as unknown as string[])[0]).not.toContain("new-secret");
    }
  });

  it("a missing token or a failed exchange fails the job", async () => {
    await expect(runRefreshToken(deps({ currentToken: "" }))).rejects.toThrow(/not set/);
    await expect(
      runRefreshToken(
        deps({
          exchange: async () => {
            throw new Error("denied");
          },
        }),
      ),
    ).rejects.toThrow("denied");
  });

  it("metaExchange calls the Graph endpoint and parses the response", async () => {
    const f = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ access_token: "t2", expires_in: 100 }),
        }) as Response,
    );
    expect(await metaExchange({ id: "1", secret: "s" }, f as never)("t1")).toEqual({
      token: "t2",
      expiresInSec: 100,
    });
    expect(decodeURIComponent((f.mock.calls[0] as unknown as string[])[0])).toContain(
      "grant_type=fb_exchange_token",
    );
    const bad = vi.fn(
      async () =>
        ({ ok: false, status: 400, json: async () => ({ error: { message: "bad" } }) }) as Response,
    );
    await expect(metaExchange({ id: "1", secret: "s" }, bad as never)("t")).rejects.toThrow("bad");
  });
});
