import { describe, expect, it } from "vitest";
import { withSaved } from "@/lib/saves-client";

describe("withSaved", () => {
  it("adds and removes without mutating, and tolerates an unloaded cache", () => {
    const base = ["a", "b"];
    expect(withSaved(base, "c", true)).toEqual(["a", "b", "c"]);
    expect(withSaved(base, "a", false)).toEqual(["b"]);
    expect(base).toEqual(["a", "b"]);
    expect(withSaved(undefined, "x", true)).toEqual(["x"]);
    expect(withSaved(undefined, "x", false)).toEqual([]);
  });
  it("is idempotent", () => {
    expect(withSaved(["a"], "a", true)).toEqual(["a"]);
    expect(withSaved(["a"], "z", false)).toEqual(["a"]);
  });
});
