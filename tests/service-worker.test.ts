import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

/** Run public/sw.js against a fake service-worker scope and capture its handlers. */
function load() {
  const handlers: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const scope = {
    addEventListener: (name: string, fn: (e: unknown) => void) => void (handlers[name] = fn),
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      matchAll: async () =>
        scope.openWindows as { focus: () => Promise<void>; navigate: (u: string) => void }[],
      openWindow: async (u: string) => void opened.push(u),
    },
    openWindows: [] as unknown[],
    String,
    Promise,
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { self: scope, ...scope });
  return { handlers, shown, opened, navigated, scope };
}

describe("service worker", () => {
  it("shows the pushed title, body and tag", async () => {
    const { handlers, shown } = load();
    let waited: Promise<unknown> | undefined;
    handlers.push({
      data: {
        json: () => ({ title: "Reg closes tomorrow", body: "Case Comp", url: "/game/x", tag: "t" }),
      },
      waitUntil: (p: Promise<unknown>) => (waited = p),
    });
    await waited;
    expect(shown[0]).toMatchObject({
      title: "Reg closes tomorrow",
      options: { body: "Case Comp", tag: "t" },
    });
  });
  it("a malformed push still shows a generic notification", async () => {
    const { handlers, shown } = load();
    let waited: Promise<unknown> | undefined;
    handlers.push({
      data: {
        json: () => {
          throw new Error("not json");
        },
      },
      waitUntil: (p: Promise<unknown>) => (waited = p),
    });
    await waited;
    expect(shown[0].title).toBe("Comet Arena");
  });
  it("clicking opens only same-site paths; anything else goes home", async () => {
    for (const [url, want] of [
      ["/game/x", "/game/x"],
      ["https://evil.example", "/"],
      ["//evil.example", "/"],
      [undefined, "/"],
    ] as const) {
      const { handlers, opened } = load();
      let waited: Promise<unknown> | undefined;
      handlers.notificationclick({
        notification: { close: vi.fn(), data: { url } },
        waitUntil: (p: Promise<unknown>) => (waited = p),
      });
      await waited;
      expect(opened).toEqual([want]);
    }
  });
  it("clicking focuses and navigates an open tab instead of opening another", async () => {
    const { handlers, scope, opened } = load();
    const nav = vi.fn();
    const focus = vi.fn(async () => {});
    scope.openWindows = [{ navigate: nav, focus }];
    let waited: Promise<unknown> | undefined;
    handlers.notificationclick({
      notification: { close: vi.fn(), data: { url: "/schedule" } },
      waitUntil: (p: Promise<unknown>) => (waited = p),
    });
    await waited;
    expect(nav).toHaveBeenCalledWith("/schedule");
    expect(focus).toHaveBeenCalled();
    expect(opened).toEqual([]);
  });
});
