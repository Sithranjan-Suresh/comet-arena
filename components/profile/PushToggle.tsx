"use client";
import { useEffect, useState } from "react";
import { Button, useToast } from "@/components/ui";
import { pushSupport, subscriptionJson, urlBase64ToBytes } from "@/lib/notify/push-client";

type State = "loading" | "unsupported" | "denied" | "off" | "on";

async function call(url: string, method: string, body?: unknown) {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      ok: res.ok,
      json: (await res.json().catch(() => ({}))) as { message?: string; delivered?: number },
    };
  } catch {
    return { ok: false, json: { message: "Network problem. Try again." } };
  }
}

/** Opt in to deadline notifications in this browser, and send yourself a test. */
export function PushToggle({ publicKey }: { publicKey: string | undefined }) {
  const toast = useToast();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const support = pushSupport({
        Notification: typeof Notification === "undefined" ? undefined : Notification,
        hasServiceWorker: "serviceWorker" in navigator,
        hasPushManager: typeof window !== "undefined" && "PushManager" in window,
      });
      if (!alive) return;
      if (support === "unsupported" || !publicKey) return setState("unsupported");
      if (support === "denied") return setState("denied");
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const existing = await reg.pushManager.getSubscription();
        if (alive) setState(existing ? "on" : "off");
      } catch {
        if (alive) setState("unsupported");
      }
    })();
    return () => {
      alive = false;
    };
  }, [publicKey]);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(publicKey!),
      });
      const json = subscriptionJson(sub);
      const r = json
        ? await call("/api/push/subscribe", "POST", json)
        : { ok: false, json: { message: "This browser did not give us a subscription." } };
      if (r.ok) {
        setState("on");
        toast.show("Notifications are on for this device", "success");
      } else {
        await sub.unsubscribe().catch(() => {});
        toast.show(r.json.message ?? "Could not turn notifications on.", "error");
      }
    } catch {
      toast.show("Could not turn notifications on.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await call("/api/push/subscribe", "DELETE", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const r = await call("/api/push/test", "POST");
    setBusy(false);
    toast.show(
      r.ok ? "Test sent. Check your notifications." : (r.json.message ?? "Could not send a test."),
      r.ok ? "success" : "error",
    );
  }

  if (state === "loading" || state === "unsupported") return null;
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-semibold">Browser notifications</legend>
      {state === "denied" ? (
        <p className="text-ink-muted text-sm">
          Notifications are blocked for this site. Allow them in your browser settings to get
          deadline alerts.
        </p>
      ) : state === "on" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            On for this device. We send a notification with each deadline warning.
          </p>
          <Button size="sm" variant="secondary" loading={busy} onClick={test}>
            Send a test
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={disable}>
            Turn off
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" loading={busy} onClick={enable}>
          Turn on deadline notifications
        </Button>
      )}
    </fieldset>
  );
}
