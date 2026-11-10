import { createInstagramBusinessDiscovery } from "./live/instagram";
import { createUtdClubs } from "./live/utdclubs";
import { createOpenAICompatibleEmbedder } from "./live/embeddings";
import { createResendMailer } from "./live/resend";
import { createGroqVision } from "./live/groq";
import { Chaos } from "./mock/chaos";
import { mockClubs, mockFeed, mockInstagram, mockVision } from "./mock/adapters";
import { mockEmbedder } from "./mock/embedder";
import { createMockMailer } from "./mock/mailer";
import { notImplemented } from "./stubs";
import type { Sources } from "./types";

export * from "./errors";
export * from "./types";

/** The two complete adapter sets. Real implementations replace the stubs task by task. */
export interface SourceFactories {
  mock: () => Omit<Sources, "mode">;
  live: () => Omit<Sources, "mode">;
}

export const defaultFactories: SourceFactories = {
  mock: () => {
    // One chaos instance shared by all mock adapters so "one 429 per run" is truly once per run.
    const chaos = Chaos.fromEnv();
    return {
      instagram: mockInstagram(chaos),
      devpost: mockFeed("devpost", chaos),
      mlh: mockFeed("mlh", chaos),
      utdclubs: mockClubs(chaos),
      vision: mockVision(chaos),
      embedder: mockEmbedder(),
      mailer: createMockMailer(),
    };
  },
  live: () => ({
    instagram: createInstagramBusinessDiscovery({
      userId: process.env.META_IG_USER_ID ?? "",
      accessToken: process.env.META_LONG_LIVED_TOKEN ?? "",
    }),
    devpost: notImplemented("devpost(live)", "Task 97"),
    mlh: notImplemented("mlh(live)", "Task 97"),
    utdclubs: createUtdClubs({
      apiKey: process.env.NEBULA_API_KEY || undefined,
      baseUrl: process.env.UTDCLUBS_BASE_URL || undefined,
    }),
    vision: createGroqVision({
      apiKey: process.env.GROQ_API_KEY ?? "",
      model: process.env.GROQ_VISION_MODEL || undefined,
      maxImages: process.env.GROQ_MAX_IMAGES ? Number(process.env.GROQ_MAX_IMAGES) : undefined,
    }),
    embedder: createOpenAICompatibleEmbedder({
      apiKey: process.env.EMBEDDINGS_API_KEY ?? "",
      baseUrl: process.env.EMBEDDINGS_BASE_URL || undefined,
      model: process.env.EMBEDDINGS_MODEL || undefined,
    }),
    mailer: createResendMailer({
      apiKey: process.env.RESEND_API_KEY ?? "",
      from: process.env.EMAIL_FROM || "Comet Arena <alerts@example.com>",
    }),
  }),
};

export type SourcesMode = "mock" | "live";

/** `SOURCES_MODE` unset or anything but "live" means mock (the safe default: no network, no spend). */
export function resolveMode(raw: string | undefined = process.env.SOURCES_MODE): SourcesMode {
  return raw === "live" ? "live" : "mock";
}

/** Build an adapter set for a mode. Pure: used directly by tests. */
export function createSources(
  mode: SourcesMode,
  factories: SourceFactories = defaultFactories,
): Sources {
  return { mode, ...factories[mode]() };
}

let cached: Sources | undefined;

/** The adapters for the current environment. Call sites use this and never branch on the mode. */
export function getSources(): Sources {
  cached ??= createSources(resolveMode());
  return cached;
}

/** Test hook: replace (or clear with undefined) the cached adapter set. */
export function setSourcesForTest(sources: Sources | undefined): void {
  cached = sources;
}
