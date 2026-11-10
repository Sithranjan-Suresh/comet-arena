import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { verifyInternalKey } from "@/lib/auth/internal-key";

describe("verifyInternalKey", () => {
  const key = "a-long-random-internal-key";
  it("accepts only the exact key", () => {
    expect(verifyInternalKey(key, key)).toBe(true);
    expect(verifyInternalKey(key + "x", key)).toBe(false);
    expect(verifyInternalKey("wrong", key)).toBe(false);
  });
  it("is locked when the secret is unset or the header is missing", () => {
    expect(verifyInternalKey("anything", undefined)).toBe(false);
    expect(verifyInternalKey("anything", "")).toBe(false);
    expect(verifyInternalKey(null, key)).toBe(false);
    expect(verifyInternalKey(undefined, key)).toBe(false);
  });
});
