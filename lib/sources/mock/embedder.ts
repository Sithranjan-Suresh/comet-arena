import type { Embedder } from "../types";

export const EMBEDDING_DIM = 768;

/** FNV-1a 32-bit. */
function fnv(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic mock embedding: hashes word unigrams and bigrams into 768 signed buckets and
 * L2-normalizes. Texts that share words score high cosine similarity and unrelated texts score
 * near zero, which is enough to exercise the dedupe bands without a model.
 */
export function hashEmbed(text: string, dim = EMBEDDING_DIM): number[] {
  const tokens = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const v = new Array<number>(dim).fill(0);
  const add = (feature: string, weight: number) => {
    const idx = fnv(feature) % dim;
    const sign = fnv(feature, 0x9747b28c) & 1 ? 1 : -1;
    v[idx] += sign * weight;
  };
  tokens.forEach((t, i) => {
    add(`u:${t}`, 1);
    if (i > 0) add(`b:${tokens[i - 1]}_${t}`, 0.7);
  });

  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm === 0) {
    v[0] = 1; // empty text: fixed unit vector so callers never see NaN
    return v;
  }
  return v.map((x) => x / norm);
}

export function mockEmbedder(): Embedder {
  return { embed: async (text) => hashEmbed(text) };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}
