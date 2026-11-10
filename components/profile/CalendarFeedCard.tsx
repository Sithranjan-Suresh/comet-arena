"use client";
import { useState } from "react";
import { Button, useToast } from "@/components/ui";
import { icsFeedUrl } from "@/lib/ics-token";

export function CalendarFeedCard({
  appUrl,
  initialToken,
}: {
  appUrl: string;
  initialToken: string;
}) {
  const toast = useToast();
  const [token, setToken] = useState(initialToken);
  const [rotating, setRotating] = useState(false);
  const url = icsFeedUrl(appUrl, token);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.show("Calendar link copied", "success");
    } catch {
      toast.show("Could not copy. Select the link and copy it manually.", "error");
    }
  }

  async function rotate() {
    if (!window.confirm("Generate a new link? Calendars using the old link will stop updating."))
      return;
    setRotating(true);
    try {
      const res = await fetch("/api/me/ics-token", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { ics_token: string };
      setToken(data.ics_token);
      toast.show("New calendar link created. Re-subscribe in your calendar app.", "success");
    } catch {
      toast.show("Could not create a new link. Please try again.", "error");
    } finally {
      setRotating(false);
    }
  }

  return (
    <section aria-labelledby="cal" className="bg-turf text-chalk rounded-xl p-5">
      <h2 id="cal" className="text-2xl font-bold">
        Your calendar feed
      </h2>
      <p className="text-chalk-muted mt-1 text-sm">
        Subscribe once and every stage of every competition you save shows up on your phone
        calendar. Keep this link private: anyone with it can see your saved deadlines.
      </p>
      <input
        readOnly
        aria-label="Calendar feed URL"
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="bg-scoreboard text-chalk mt-3 min-h-11 w-full rounded-lg px-3 font-mono text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <Button onClick={copy}>Copy link</Button>
        <Button
          variant="ghost"
          className="text-chalk hover:bg-turf-light"
          onClick={rotate}
          loading={rotating}
        >
          Generate new link
        </Button>
      </div>
    </section>
  );
}
