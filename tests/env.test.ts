import { describe, expect, it } from "vitest";
import { EnvError, LIVE_REQUIRED_KEYS, parsePublicEnv, parseServerEnv } from "@/lib/env";

const base = { SUPABASE_SERVICE_KEY: "service-key" };

describe("parseServerEnv", () => {
  it("boots in mock mode with only the Supabase service key", () => {
    const env = parseServerEnv(base);
    expect(env.SOURCES_MODE).toBe("mock");
    expect(env.APP_TIMEZONE).toBe("America/Chicago");
  });

  it("requires every integration key in live mode", () => {
    try {
      parseServerEnv({ ...base, SOURCES_MODE: "live" });
      throw new Error("expected EnvError");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      const msg = (e as Error).message;
      for (const key of LIVE_REQUIRED_KEYS) expect(msg).toContain(key);
    }
  });

  it("accepts live mode when all keys are present", () => {
    const keys = Object.fromEntries(LIVE_REQUIRED_KEYS.map((k) => [k, "x".repeat(20)]));
    expect(parseServerEnv({ ...base, SOURCES_MODE: "live", ...keys }).SOURCES_MODE).toBe("live");
  });

  it("gives a readable error when the service key is missing", () => {
    expect(() => parseServerEnv({})).toThrow(/SUPABASE_SERVICE_KEY/);
  });

  it("rejects an invalid SOURCES_MODE", () => {
    expect(() => parseServerEnv({ ...base, SOURCES_MODE: "banana" })).toThrow(EnvError);
  });
});

describe("parsePublicEnv", () => {
  it("validates the Supabase URL and defaults the app URL", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    });
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("throws when the URL is malformed", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "nope", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
