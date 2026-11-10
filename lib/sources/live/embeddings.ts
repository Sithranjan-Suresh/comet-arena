import { SourceError } from "../errors";
import type { Embedder } from "../types";
import { EMBEDDING_DIM } from "../mock/embedder";

export interface EmbeddingsOptions {
  apiKey: string;
  /** Any OpenAI-compatible provider: POST {baseUrl}/embeddings. */
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Embeddings over the OpenAI-compatible `/embeddings` API with `dimensions: 768` to match
 * `competitions.embedding vector(768)`. Provider and model are env-configurable
 * (EMBEDDINGS_BASE_URL, EMBEDDINGS_MODEL); everything funnels through this one function so
 * swapping providers never touches call sites (engineering_spec §11).
 */
export function createOpenAICompatibleEmbedder(opts: EmbeddingsOptions): Embedder {
  const baseUrl = (opts.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = opts.model ?? "text-embedding-3-small";
  const timeoutMs = opts.timeoutMs ?? 8000;
  const doFetch = opts.fetchImpl ?? fetch;
  const name = "embeddings";

  return {
    async embed(text) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await doFetch(`${baseUrl}/embeddings`, {
          method: "POST",
          headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, input: text, dimensions: EMBEDDING_DIM }),
          signal: controller.signal,
        });
      } catch (e) {
        if (controller.signal.aborted) throw new SourceError(name, "timeout");
        throw new SourceError(
          name,
          "unavailable",
          `${name}: network error (${(e as Error).message})`,
        );
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after"));
        throw new SourceError(
          name,
          "rate_limit",
          undefined,
          Number.isFinite(retry) && retry > 0 ? retry * 1000 : 1000,
        );
      }
      if (!res.ok) throw new SourceError(name, "unavailable", `${name}: HTTP ${res.status}`);
      const body = (await res.json().catch(() => null)) as {
        data?: { embedding?: number[] }[];
      } | null;
      const vec = body?.data?.[0]?.embedding;
      if (
        !Array.isArray(vec) ||
        vec.length !== EMBEDDING_DIM ||
        vec.some((x) => typeof x !== "number")
      ) {
        throw new SourceError(
          name,
          "malformed",
          `${name}: expected a ${EMBEDDING_DIM}-dimension vector`,
        );
      }
      return vec;
    },
  };
}
