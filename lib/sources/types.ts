import type { Club } from "@/lib/orgs/merge";

/** One Instagram post (Business Discovery / Apify normalized). */
export interface IgPost {
  id: string;
  caption: string | null;
  permalink: string;
  postedAt: string; // ISO
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  /** Image URLs: the cover plus carousel children (video posts contribute their thumbnail). */
  mediaUrls: string[];
}

export type IgFetchResult =
  | { status: "ok"; posts: IgPost[] }
  /** Handle is not a Business/Creator account (route to Apify) or does not exist. */
  | { status: "no_account" };

export interface InstagramSource {
  fetchRecentPosts(handle: string, opts?: { limit?: number }): Promise<IgFetchResult>;
}

/** A listing from Devpost / MLH (already normalized to text for extraction). */
export interface FeedListing {
  source: "devpost" | "mlh";
  externalId: string;
  url: string;
  title: string;
  text: string; // description + dates as plain text
  postedAt: string;
}
export interface FeedSource {
  fetchListings(): Promise<FeedListing[]>;
}

/** Course catalog (Nebula Labs): direct prerequisite course codes, or null when the course is unknown. */
export interface CourseSource {
  fetchPrereqs(code: string): Promise<string[] | null>;
}

/** An event from a campus calendar (UTD Clubs, CampusGroups). Structured dates, unlike a flyer. */
export interface CampusEvent {
  source: "utdclubs" | "campusgroups";
  externalId: string;
  url: string;
  title: string;
  description: string;
  host: string | null;
  location: string | null;
  /** ISO instants. */
  start: string;
  end: string | null;
}
export interface EventSource {
  fetchEvents(range: { from: Date; to: Date }): Promise<CampusEvent[]>;
}

export interface ClubsSource {
  fetchClubs(): Promise<Club[]>;
}

/** Raw vision/LLM call. Validation and repair live in the extraction pipeline, not here. */
export interface VisionModel {
  complete(input: {
    system: string;
    user: string;
    /** Public URLs or data: URLs, at most 10. */
    images: string[];
    signal?: AbortSignal;
  }): Promise<string>;
}

export interface Embedder {
  /** 768-dimensional embedding. Same text gives the same vector. */
  embed(text: string): Promise<number[]>;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Same key => at most one delivery (warnings: user+stage+window). */
  idempotencyKey?: string;
  headers?: Record<string, string>;
}
export interface Mailer {
  send(msg: MailMessage): Promise<{ id: string }>;
}

export interface Sources {
  mode: "mock" | "live";
  instagram: InstagramSource;
  devpost: FeedSource;
  mlh: FeedSource;
  utdclubs: ClubsSource;
  nebula: CourseSource;
  utdclubsEvents: EventSource;
  campusgroups: EventSource;
  push: PushSender;
  discord: DiscordSender;
  vision: VisionModel;
  embedder: Embedder;
  mailer: Mailer;
}

/** A browser push subscription as the browser gives it to us. */
export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface PushPayload {
  title: string;
  body: string;
  /** Path or URL opened when the notification is clicked. */
  url: string;
  tag?: string;
}
/** "gone" = the browser says this subscription no longer exists (unsubscribed or expired): delete it. */
export interface PushSender {
  send(sub: PushSubscriptionData, payload: PushPayload): Promise<"ok" | "gone">;
}

export interface DiscordMessage {
  content?: string;
  embeds?: {
    title: string;
    url?: string;
    description?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
  }[];
}
/** Posts to one channel through an incoming webhook. */
export interface DiscordSender {
  post(message: DiscordMessage): Promise<void>;
}
