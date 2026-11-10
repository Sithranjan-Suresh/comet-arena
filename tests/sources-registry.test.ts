import { afterEach, describe, expect, it } from "vitest";
import {
  type SourceFactories,
  createSources,
  defaultFactories,
  getSources,
  resolveMode,
  setSourcesForTest,
} from "@/lib/sources";
import type { Mailer } from "@/lib/sources";
import { notImplemented } from "@/lib/sources/stubs";

afterEach(() => setSourcesForTest(undefined));

const marker = (name: string): Mailer => ({ send: async () => ({ id: name }) });
const factories: SourceFactories = {
  mock: () => ({ ...defaultFactories.mock(), mailer: marker("mock") }),
  live: () => ({ ...defaultFactories.live(), mailer: marker("live") }),
};

describe("resolveMode", () => {
  it("defaults to mock and only 'live' enables live", () => {
    expect(resolveMode(undefined)).toBe("mock");
    expect(resolveMode("mock")).toBe("mock");
    expect(resolveMode("LIVE")).toBe("mock"); // exact match only: never go live by accident
    expect(resolveMode("production")).toBe("mock");
    expect(resolveMode("live")).toBe("live");
  });
});

describe("createSources", () => {
  it("swaps the adapter implementation by mode with no call-site change", async () => {
    const mock = createSources("mock", factories);
    const live = createSources("live", factories);
    expect(mock.mode).toBe("mock");
    expect(live.mode).toBe("live");
    expect((await mock.mailer.send({ to: "a", subject: "", html: "", text: "" })).id).toBe("mock");
    expect((await live.mailer.send({ to: "a", subject: "", html: "", text: "" })).id).toBe("live");
  });

  it("exposes every adapter in both modes", () => {
    for (const mode of ["mock", "live"] as const) {
      const s = createSources(mode);
      for (const key of [
        "instagram",
        "devpost",
        "mlh",
        "utdclubs",
        "vision",
        "embedder",
        "mailer",
      ] as const) {
        expect(s[key], `${mode}.${key}`).toBeDefined();
      }
    }
  });
});

describe("placeholder adapters", () => {
  it("fail loudly with the task that will implement them", () => {
    const s = createSources("live", {
      ...factories,
      live: () => ({
        ...factories.live(),
        instagram: notImplemented("instagram(live)", "Task 93"),
      }),
    });
    try {
      s.instagram.fetchRecentPosts("x");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toMatchObject({ kind: "not_implemented" });
      expect((e as Error).message).toContain("Task 93");
    }
  });
});

describe("getSources", () => {
  it("caches and can be overridden in tests", () => {
    const a = getSources();
    expect(getSources()).toBe(a);
    const fake = createSources("live", factories);
    setSourcesForTest(fake);
    expect(getSources()).toBe(fake);
  });
});
