import { describe, expect, it } from "vitest";
import {
  googleCalendarSubscribeUrl,
  icsFeedUrl,
  isLocalUrl,
  outlookSubscribeUrl,
  webcalUrl,
} from "@/lib/ics-url";

const feed = icsFeedUrl("https://cometarena.example", "a".repeat(48));

describe("subscribe URLs", () => {
  it("webcal swaps the scheme and keeps the rest", () => {
    expect(webcalUrl(feed)).toBe(`webcal://cometarena.example/api/calendar/${"a".repeat(48)}.ics`);
    expect(webcalUrl("http://localhost:3000/x.ics")).toBe("webcal://localhost:3000/x.ics");
  });

  it("Google's flow passes the webcal URL as an encoded cid", () => {
    const url = googleCalendarSubscribeUrl(feed);
    expect(url.startsWith("https://calendar.google.com/calendar/r?cid=")).toBe(true);
    const cid = new URL(url).searchParams.get("cid");
    expect(cid).toBe(webcalUrl(feed));
  });

  it("Outlook's flow carries the https feed URL and a calendar name", () => {
    const u = new URL(outlookSubscribeUrl(feed));
    expect(u.origin + u.pathname).toBe("https://outlook.live.com/calendar/0/addfromweb");
    expect(u.searchParams.get("url")).toBe(feed);
    expect(u.searchParams.get("name")).toBe("Comet Arena deadlines");
  });
});

describe("isLocalUrl", () => {
  it.each([
    "http://localhost:3000/x",
    "http://127.0.0.1/x",
    "https://app.local/x",
    "https://foo.localhost/x",
    "not a url",
  ])("%s is local", (u) => expect(isLocalUrl(u)).toBe(true));
  it.each(["https://cometarena.example/x", "https://comet-arena.vercel.app/x"])(
    "%s is public",
    (u) => expect(isLocalUrl(u)).toBe(false),
  );
});
