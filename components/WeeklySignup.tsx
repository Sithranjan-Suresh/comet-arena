"use client";
import { useState } from "react";
import { Button, Input } from "@/components/ui";

/** Comet Arena Weekly signup (double opt-in). Works without an account. */
export function WeeklySignup({ className }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "limited">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return setState("error");
    setState("sending");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, website: honeypot }),
      });
      setState(res.ok ? "sent" : res.status === 429 ? "limited" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div role="status" className={`bg-turf text-chalk rounded-xl p-4 ${className ?? ""}`}>
        <p className="font-semibold">Check your inbox.</p>
        <p className="text-chalk-muted text-sm">
          We sent a link to confirm. Nothing is sent until you click it.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="weekly-title"
      className={`bg-turf text-chalk rounded-xl p-4 ${className ?? ""}`}
    >
      <h2 id="weekly-title" className="text-xl font-bold">
        Comet Arena Weekly
      </h2>
      <p className="text-chalk-muted mb-3 text-sm">
        Every UTD competition closing this week and what is new, Sundays at 6 PM.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 [&_label]:text-chalk">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={
              state === "error"
                ? "Enter a valid email and try again."
                : state === "limited"
                  ? "Too many attempts. Try again later."
                  : undefined
            }
          />
        </div>
        {/* Honeypot: hidden from people and assistive tech, bots fill it. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </label>
        </div>
        <Button type="submit" loading={state === "sending"}>
          Subscribe
        </Button>
      </div>
    </form>
  );
}
