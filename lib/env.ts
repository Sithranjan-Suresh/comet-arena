import { z } from "zod";

/**
 * Environment validation (engineering_spec §12).
 *
 * - Public vars (NEXT_PUBLIC_*) are safe for the browser bundle.
 * - Server vars must only be read through `serverEnv()`, which throws if called in the browser.
 * - In `SOURCES_MODE=mock` only the Supabase vars are required, so the app boots without any
 *   third-party keys. In `live` mode every integration key is required.
 */

const modeSchema = z.enum(["mock", "live"]).default("mock");

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const baseServerSchema = z.object({
  SUPABASE_SERVICE_KEY: z.string().min(1),
  SOURCES_MODE: modeSchema,
  APP_TIMEZONE: z.string().default("America/Chicago"),
  EXTRACT_INTERNAL_KEY: z.string().min(16).optional(),
  GROQ_API_KEY: z.string().optional(),
  EMBEDDINGS_API_KEY: z.string().optional(),
  META_IG_USER_ID: z.string().optional(),
  META_LONG_LIVED_TOKEN: z.string().optional(),
  APIFY_TOKEN: z.string().optional(),
  NEBULA_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  UNSUBSCRIBE_SECRET: z.string().min(16).optional(),
});

/** Keys that become mandatory when SOURCES_MODE=live. */
export const LIVE_REQUIRED_KEYS = [
  "EXTRACT_INTERNAL_KEY",
  "GROQ_API_KEY",
  "EMBEDDINGS_API_KEY",
  "META_IG_USER_ID",
  "META_LONG_LIVED_TOKEN",
  "APIFY_TOKEN",
  "NEBULA_API_KEY",
  "RESEND_API_KEY",
  "UNSUBSCRIBE_SECRET",
] as const;

const serverSchema = baseServerSchema.superRefine((val, ctx) => {
  if (val.SOURCES_MODE !== "live") return;
  for (const key of LIVE_REQUIRED_KEYS) {
    if (!val[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when SOURCES_MODE=live`,
      });
    }
  }
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

export class EnvError extends Error {
  constructor(scope: string, issues: z.ZodIssue[]) {
    const lines = issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    super(`Invalid ${scope} environment variables:\n${lines.join("\n")}\nSee .env.example.`);
    this.name = "EnvError";
  }
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicSchema.safeParse(source);
  if (!result.success) throw new EnvError("public", result.error.issues);
  return result.data;
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) throw new EnvError("server", result.error.issues);
  return result.data;
}

let cachedPublic: PublicEnv | undefined;
let cachedServer: ServerEnv | undefined;

/** Public env. Next inlines NEXT_PUBLIC_* at build time, so each is read explicitly. */
export function publicEnv(): PublicEnv {
  cachedPublic ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  return cachedPublic;
}

/** Server env. Throws if called from the browser. */
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must not be called in the browser.");
  }
  cachedServer ??= parseServerEnv(process.env);
  return cachedServer;
}

export function isMockMode(): boolean {
  return (process.env.SOURCES_MODE ?? "mock") !== "live";
}
