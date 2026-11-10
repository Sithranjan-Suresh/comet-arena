"use client";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { countdownParts } from "@/lib/countdown";
import { formatCT } from "@/lib/time";

// One shared minute ticker for every Countdown on the page.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let minute = Math.floor(Date.now() / 60_000);

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      const m = Math.floor(Date.now() / 60_000);
      if (m !== minute) {
        minute = m;
        listeners.forEach((l) => l());
      }
    }, 5_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const getSnapshot = () => Math.floor(Date.now() / 60_000);
// Server and hydration render the static CT deadline; digits appear after mount (no mismatch,
// and correct even when the page HTML came from an ISR cache).
const getServerSnapshot = () => null;

export function Countdown({
  deadline,
  variant = "led",
  className,
}: {
  deadline: string;
  variant?: "led" | "inline";
  className?: string;
}) {
  const tick = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const live = tick !== null;
  const parts = live ? countdownParts(deadline, new Date(tick * 60_000)) : null;

  const text = parts ? parts.digits : formatCT(deadline, "date");
  const spoken = parts ? parts.spoken : `Deadline ${formatCT(deadline)}`;
  const closed = parts?.state === "closed";

  return (
    <time
      dateTime={deadline}
      aria-label={spoken}
      title={formatCT(deadline)}
      className={cn(
        variant === "led"
          ? "inline-block rounded-md bg-scoreboard px-3 py-1 text-lg"
          : "font-semibold tabular-nums",
        variant === "led" && !closed && "led-digits",
        variant === "led" && closed && "font-led text-chalk-muted",
        className,
      )}
    >
      {text}
    </time>
  );
}
