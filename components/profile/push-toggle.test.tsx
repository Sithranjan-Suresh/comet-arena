// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PushToggle } from "@/components/profile/PushToggle";
import { ToastProvider } from "@/components/ui";

const KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const sub = {
  endpoint: "https://push.example/a",
  toJSON: () => ({
    endpoint: "https://push.example/a",
    keys: { p256dh: "p".repeat(30), auth: "a".repeat(12) },
  }),
  unsubscribe: vi.fn(async () => true),
};

function setup(
  opts: { permission?: string; existing?: unknown; requestResult?: string; support?: boolean } = {},
) {
  const pushManager = {
    getSubscription: vi.fn(async () => opts.existing ?? null),
    subscribe: vi.fn(async () => sub),
  };
  const reg = { pushManager };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value:
      opts.support === false
        ? undefined
        : { register: vi.fn(async () => reg), ready: Promise.resolve(reg) },
  });
  if (opts.support === false)
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
  (window as unknown as { PushManager: unknown }).PushManager =
    opts.support === false ? undefined : class {};
  if (opts.support === false) delete (window as unknown as { PushManager?: unknown }).PushManager;
  vi.stubGlobal(
    "Notification",
    Object.assign(vi.fn(), {
      permission: opts.permission ?? "default",
      requestPermission: vi.fn(async () => opts.requestResult ?? "granted"),
    }),
  );
  return pushManager;
}
const mount = (key: string | undefined = KEY) =>
  render(
    <ToastProvider>
      <PushToggle publicKey={key} />
    </ToastProvider>,
  );
const respond = (ok = true) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({ ok, status: ok ? 201 : 503, json: async () => ({ message: "nope" }) }) as Response,
    ),
  );

beforeEach(() => sub.unsubscribe.mockClear());
afterEach(() => vi.unstubAllGlobals());

describe("PushToggle", () => {
  it("renders nothing when the browser cannot do push or no key is configured", async () => {
    setup({ support: false });
    const { container } = mount();
    await waitFor(() => expect(container.querySelector("fieldset")).toBeNull());
    setup();
    const second = mount(undefined);
    expect(second.container.querySelector("fieldset")).toBeNull();
  });

  it("explains a blocked permission", async () => {
    setup({ permission: "denied" });
    mount();
    expect(await screen.findByText(/blocked for this site/)).toBeInTheDocument();
  });

  it("turning on asks permission, subscribes the browser and registers it with the server", async () => {
    const pm = setup();
    respond();
    mount();
    await userEvent.click(
      await screen.findByRole("button", { name: "Turn on deadline notifications" }),
    );
    expect(await screen.findByRole("button", { name: "Send a test" })).toBeInTheDocument();
    expect(pm.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    const [url, init] = (
      fetch as unknown as { mock: { calls: [string, { method: string; body: string }][] } }
    ).mock.calls[0];
    expect(url).toBe("/api/push/subscribe");
    expect(JSON.parse(init.body)).toEqual({
      endpoint: "https://push.example/a",
      keys: { p256dh: "p".repeat(30), auth: "a".repeat(12) },
    });
  });

  it("if the server refuses, the browser subscription is undone and the student is told", async () => {
    setup();
    respond(false);
    mount();
    await userEvent.click(
      await screen.findByRole("button", { name: "Turn on deadline notifications" }),
    );
    expect(await screen.findByText("nope")).toBeInTheDocument();
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Turn on deadline notifications" }),
    ).toBeInTheDocument();
  });

  it("declining the permission prompt changes nothing", async () => {
    setup({ requestResult: "denied" });
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    mount();
    await userEvent.click(
      await screen.findByRole("button", { name: "Turn on deadline notifications" }),
    );
    expect(await screen.findByText(/blocked for this site/)).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("when already on: sends a test, and turning off removes the server record then the browser subscription", async () => {
    setup({ existing: sub, permission: "granted" });
    respond();
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Send a test" }));
    expect(await screen.findByText(/Test sent/)).toBeInTheDocument();
    expect((fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]).toBe(
      "/api/push/test",
    );
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(
      await screen.findByRole("button", { name: "Turn on deadline notifications" }),
    ).toBeInTheDocument();
    const del = (
      fetch as unknown as { mock: { calls: [string, { method: string; body: string }][] } }
    ).mock.calls[1];
    expect(del[1].method).toBe("DELETE");
    expect(JSON.parse(del[1].body)).toEqual({ endpoint: "https://push.example/a" });
    expect(sub.unsubscribe).toHaveBeenCalled();
  });
});
