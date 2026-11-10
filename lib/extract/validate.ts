import type { ZodError } from "zod";
import { type Extraction, type ExtractResponse, extractionSchema } from "@/lib/schemas";
import { SourceError, type VisionModel } from "@/lib/sources";
import { buildRepairPrompt } from "./prompt";

/** Pull a JSON value out of model text: tolerates code fences and stray prose around one object. */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new SyntaxError("no JSON object found in model output");
  }
}

/** Compact, model-readable list of what was wrong (capped so the repair prompt stays small). */
export function formatZodError(error: ZodError, max = 10): string {
  return error.issues
    .slice(0, max)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

type Parsed = { ok: true; value: Extraction } | { ok: false; error: string };

function tryParse(text: string): Parsed {
  let json: unknown;
  try {
    json = parseModelJson(text);
  } catch (e) {
    return { ok: false, error: `Output was not valid JSON: ${(e as Error).message}` };
  }
  const result = extractionSchema.safeParse(json);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: formatZodError(result.error) };
}

export interface ValidatedExtraction {
  result: ExtractResponse;
  /** True when the first answer was invalid and the repair call produced the result (or also failed). */
  repaired: boolean;
}

/**
 * Call the model, validate, and repair at most once (engineering_spec §4). Infrastructure failures
 * (timeout, rate limit, outage) are NOT swallowed here: they propagate as SourceError so callers
 * can queue or retry per the failure-state table. An empty completion counts as invalid output.
 */
export async function extractWithRepair(args: {
  vision: VisionModel;
  prompt: { system: string; user: string };
  images: string[];
  signal?: AbortSignal;
}): Promise<ValidatedExtraction> {
  const { vision, prompt, images, signal } = args;

  const call = async (p: { system: string; user: string }): Promise<string> => {
    try {
      return await vision.complete({ ...p, images, signal });
    } catch (e) {
      if (e instanceof SourceError && e.kind === "malformed") return ""; // unusable output, eligible for repair
      throw e;
    }
  };

  const first = await call(prompt);
  const firstParsed = tryParse(first);
  if (firstParsed.ok) return { result: firstParsed.value, repaired: false };

  const second = await call(buildRepairPrompt(prompt, first, firstParsed.error));
  const secondParsed = tryParse(second);
  if (secondParsed.ok) return { result: secondParsed.value, repaired: true };

  return {
    result: {
      kind: "error",
      reason: `Model output failed validation twice: ${secondParsed.error.split("\n")[0]}`,
    },
    repaired: true,
  };
}
