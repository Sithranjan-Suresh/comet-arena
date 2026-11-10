import { loadFeedListings, loadFlyerCases } from "@/lib/fixtures";
import { type Club, snapshotSchema } from "@/lib/orgs/merge";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SourceError } from "../errors";
import { normalizeCourse } from "@/lib/courses";
import { z } from "zod";
import type {
  ClubsSource,
  CourseSource,
  FeedSource,
  IgPost,
  InstagramSource,
  VisionModel,
} from "../types";
import { Chaos, throwForOutcome } from "./chaos";
import { REPAIR_MARKER, mockFlyerUrl } from "./constants";

const base = (p: string) => p.split("/").pop()!.split("?")[0];

/** Mock vision model: answers from the canned fixtures, with simulated latency and failures. */
export function mockVision(chaos: Chaos = Chaos.fromEnv()): VisionModel {
  return {
    async complete({ images, user }) {
      const outcome = await chaos.roll();
      const isRepair = user.includes(REPAIR_MARKER);
      if (outcome === "timeout" || outcome === "rate_limit") throwForOutcome("groq(mock)", outcome);

      const cases = loadFlyerCases();
      const names = new Set(images.map(base));
      const match =
        cases.find((c) => c.images.some((f) => names.has(f))) ??
        cases.find((c) => c.caption.length > 20 && user.includes(c.caption.slice(0, 40)));
      const json = JSON.stringify(
        match
          ? match.expected
          : {
              is_competition: false,
              kind: "not_competition",
              confidence: 0.3,
              missing_fields: ["title"],
            },
      );
      // Repair calls are never corrupted so the repair path can succeed.
      if (outcome === "malformed" && !isRepair) return json.slice(0, Math.floor(json.length * 0.6));
      return json;
    },
  };
}

/** Mock Instagram: posts come from the flyer cases whose sample handle matches. */
export function mockInstagram(chaos: Chaos = Chaos.fromEnv()): InstagramSource {
  return {
    async fetchRecentPosts(handle, opts) {
      await chaos.guard("instagram(mock)");
      const mine = loadFlyerCases().filter((c) => c.ig_handle === handle.toLowerCase());
      if (mine.length === 0) return { status: "no_account" };
      const posts: IgPost[] = mine
        .sort((a, b) => b.posted_at.localeCompare(a.posted_at))
        .slice(0, opts?.limit ?? 10)
        .map((c) => ({
          id: `mock_${c.id}`,
          caption: c.caption,
          permalink: `https://instagram.example/p/${c.id}`,
          postedAt: c.posted_at,
          mediaType: c.images.length > 1 ? "CAROUSEL_ALBUM" : "IMAGE",
          mediaUrls: c.images.map(mockFlyerUrl),
        }));
      return { status: "ok", posts };
    },
  };
}

export function mockFeed(source: "devpost" | "mlh", chaos: Chaos = Chaos.fromEnv()): FeedSource {
  return {
    async fetchListings() {
      await chaos.guard(`${source}(mock)`);
      return loadFeedListings().filter((l) => l.source === source);
    },
  };
}

export function mockClubs(chaos: Chaos = Chaos.fromEnv()): ClubsSource {
  return {
    async fetchClubs(): Promise<Club[]> {
      await chaos.guard("utdclubs(mock)");
      const file = path.resolve(process.cwd(), "fixtures/utdclubs-snapshot.json");
      const snapshot = snapshotSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
      if (!snapshot.success)
        throw new SourceError("utdclubs(mock)", "malformed", "snapshot fixture is invalid");
      return snapshot.data.clubs;
    },
  };
}

const coursesFileSchema = z.object({ courses: z.record(z.string(), z.array(z.string())) });

/** Mock Nebula: prerequisites from fixtures/nebula-courses.json. Unknown codes return null like the real API. */
export function mockNebula(chaos: Chaos = Chaos.fromEnv()): CourseSource {
  return {
    async fetchPrereqs(code) {
      await chaos.guard("nebula(mock)");
      const file = path.resolve(process.cwd(), "fixtures/nebula-courses.json");
      const parsed = coursesFileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
      if (!parsed.success)
        throw new SourceError("nebula(mock)", "malformed", "courses fixture is invalid");
      return parsed.data.courses[normalizeCourse(code)] ?? null;
    },
  };
}
