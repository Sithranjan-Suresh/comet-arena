import type { Extraction } from "@/lib/schemas";
import type { FieldErrors } from "./form";
import type { PossibleMatch } from "./handle";

/** Browser-side client for the Report a Game endpoints. Maps HTTP outcomes to values the UI can switch on. */

export type SubmitOutcome =
  | {
      kind: "ready";
      submissionId: string;
      extraction: Extraction;
      imageUrl: string | null;
      match: PossibleMatch | null;
      warning: "recap" | "not_a_competition" | null;
    }
  | { kind: "manual"; submissionId: string; reason: string; imageUrl: string | null }
  | { kind: "queued"; message: string }
  | { kind: "error"; message: string };

const GENERIC = "Something went wrong. Please try again.";

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json().catch(() => ({}))) as Record<string, unknown>) ?? {};
}

export async function postSubmission(
  choice: { url: string } | { file: File },
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitOutcome> {
  let res: Response;
  try {
    if ("file" in choice) {
      const form = new FormData();
      form.set("image", choice.file);
      res = await fetchImpl("/api/submit", { method: "POST", body: form });
    } else {
      res = await fetchImpl("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: choice.url }),
      });
    }
  } catch {
    return {
      kind: "error",
      message: "We could not reach Comet Arena. Check your connection and try again.",
    };
  }
  const body = await readJson(res);

  if (res.status === 401)
    return {
      kind: "error",
      message: "Sign in with your @utdallas.edu account to report a competition.",
    };
  if (res.status === 429)
    return {
      kind: "error",
      message: String(body.message ?? "You are submitting too fast. Try again in a bit."),
    };
  if (res.status === 202)
    return {
      kind: "queued",
      message: String(body.message ?? "Saved, we'll finish reading it shortly."),
    };
  if (!res.ok)
    return { kind: "error", message: typeof body.message === "string" ? body.message : GENERIC };

  const submissionId = String(body.submission_id ?? "");
  if (body.manual)
    return {
      kind: "manual",
      submissionId,
      reason: String(body.reason ?? ""),
      imageUrl: (body.image_url as string | null) ?? null,
    };
  return {
    kind: "ready",
    submissionId,
    extraction: body.extracted as Extraction,
    imageUrl: (body.image_url as string | null) ?? null,
    match: (body.possible_match as PossibleMatch | null) ?? null,
    warning: (body.warning as "recap" | "not_a_competition" | null) ?? null,
  };
}

export type ConfirmOutcome =
  | { kind: "done"; slug: string; outcome: "published" | "merged" }
  | { kind: "queued"; message: string }
  | { kind: "invalid"; errors: FieldErrors }
  | { kind: "error"; message: string };

export async function postConfirm(
  submissionId: string,
  payload: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<ConfirmOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/submit/${submissionId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      kind: "error",
      message: "We could not reach Comet Arena. Check your connection and try again.",
    };
  }
  const body = await readJson(res);
  if (res.ok && body.outcome === "queued")
    return { kind: "queued", message: String(body.message ?? "We'll double-check this one.") };
  if (res.ok)
    return {
      kind: "done",
      slug: String(body.competition_slug ?? ""),
      outcome: body.outcome === "merged" ? "merged" : "published",
    };
  if (res.status === 422 && Array.isArray(body.issues)) {
    const errors: FieldErrors = {};
    for (const i of body.issues as { path?: string; message?: string }[])
      if (i.path !== undefined) errors[i.path] ??= i.message ?? "Check this field";
    return { kind: "invalid", errors };
  }
  return { kind: "error", message: typeof body.message === "string" ? body.message : GENERIC };
}
