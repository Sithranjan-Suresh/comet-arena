import { SourceError } from "../errors";
import type { VisionModel } from "../types";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Defaults verified against Groq's vision docs: `qwen/qwen3.8-27b` is the generally available
 * vision model and accepts at most 3 images per request. The spec assumed a Llama model and up to
 * 10 images; both are configurable (GROQ_VISION_MODEL, GROQ_MAX_IMAGES) so a change at Groq
 * needs no code change.
 */
export const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
export const DEFAULT_GROQ_MAX_IMAGES = 3;

export interface GroqOptions {
  apiKey: string;
  model?: string;
  maxImages?: number;
  /** Abort after this long (spec: 8 s so extraction stays inside the 10 s budget). */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface GroqResponse {
  choices?: { message?: { content?: string | null } }[];
}

export function createGroqVision(opts: GroqOptions): VisionModel {
  const model = opts.model ?? DEFAULT_GROQ_MODEL;
  const maxImages = opts.maxImages ?? DEFAULT_GROQ_MAX_IMAGES;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const doFetch = opts.fetchImpl ?? fetch;
  const name = "groq";

  return {
    async complete({ system, user, images, signal }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort);

      const content: unknown[] = [{ type: "text", text: user }];
      for (const url of images.slice(0, maxImages))
        content.push({ type: "image_url", image_url: { url } });

      let res: Response;
      try {
        res = await doFetch(ENDPOINT, {
          method: "POST",
          headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content },
            ],
          }),
          signal: controller.signal,
        });
      } catch (e) {
        if (controller.signal.aborted)
          throw new SourceError(name, "timeout", `${name}: no response in ${timeoutMs} ms`);
        throw new SourceError(
          name,
          "unavailable",
          `${name}: network error (${(e as Error).message})`,
        );
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }

      if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after"));
        throw new SourceError(
          name,
          "rate_limit",
          `${name}: rate limited`,
          Number.isFinite(retry) && retry > 0 ? retry * 1000 : 1000,
        );
      }
      if (res.status === 401 || res.status === 403)
        throw new SourceError(name, "unavailable", `${name}: credentials rejected (${res.status})`);
      if (res.status >= 500)
        throw new SourceError(name, "unavailable", `${name}: server error ${res.status}`);
      if (!res.ok)
        throw new SourceError(name, "unavailable", `${name}: request rejected (${res.status})`);

      const body = (await res.json().catch(() => null)) as GroqResponse | null;
      const text = body?.choices?.[0]?.message?.content;
      if (!text) throw new SourceError(name, "malformed", `${name}: empty completion`);
      return text;
    },
  };
}
