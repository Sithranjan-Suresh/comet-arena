"use client";
import { useToast } from "@/components/ui";
import { buttonClasses } from "@/components/ui";
import { Button } from "@/components/ui";
import {
  googleCalendarSubscribeUrl,
  icsFeedUrl,
  isLocalUrl,
  outlookSubscribeUrl,
  webcalUrl,
} from "@/lib/ics-url";

/** Subscribe to the personal calendar feed in Google, Apple or Outlook, or copy the link. */
export function CalendarSubscribe({ appUrl, token }: { appUrl: string; token: string }) {
  const toast = useToast();
  const feed = icsFeedUrl(appUrl, token);
  const local = isLocalUrl(feed);

  async function copy() {
    try {
      await navigator.clipboard.writeText(feed);
      toast.show("Calendar link copied", "success");
    } catch {
      toast.show("Could not copy. Open Settings to copy your link.", "error");
    }
  }

  return (
    <section aria-labelledby="sync" className="bg-turf text-chalk rounded-xl p-4">
      <h2 id="sync" className="text-xl font-bold">
        Put every deadline on your phone
      </h2>
      <p className="text-chalk-muted mt-1 text-sm">
        Subscribe once. Saved competitions and their changed dates update on their own.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={googleCalendarSubscribeUrl(feed)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses("primary")}
        >
          Add to Google Calendar
        </a>
        <a
          href={webcalUrl(feed)}
          className={buttonClasses("secondary", "md", "bg-turf-light hover:brightness-110")}
        >
          Apple Calendar / iPhone
        </a>
        <a
          href={outlookSubscribeUrl(feed)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses("secondary", "md", "bg-turf-light hover:brightness-110")}
        >
          Outlook
        </a>
        <Button variant="ghost" className="text-chalk hover:bg-turf-light" onClick={copy}>
          Copy link
        </Button>
      </div>
      {local && (
        <p role="note" className="text-led mt-3 text-sm">
          This is a local development link. Google and Outlook can only subscribe to a public URL.
        </p>
      )}
    </section>
  );
}
