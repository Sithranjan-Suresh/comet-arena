import type { PreviewState } from "@/components/report/ExtractionPreview";
import type { ConfirmOutcome, SubmitOutcome } from "./api";
import type { FieldErrors } from "./form";
import type { PossibleMatch } from "./handle";

/**
 * The Report a Game state machine. Pure so every transition is unit tested; the React component only
 * renders the current state and dispatches actions.
 */
export type Decision = "undecided" | "merge" | "separate";

export type FlowState =
  | { step: "input"; error?: string }
  | { step: "reading"; manualRequested: boolean }
  | {
      step: "review";
      submissionId: string;
      preview: PreviewState;
      imageUrl: string | null;
      match: PossibleMatch | null;
      decision: Decision;
      mergeInto: string | null;
      serverErrors?: FieldErrors;
      banner?: string;
      submitting: boolean;
    }
  | { step: "queued"; message: string }
  | { step: "done"; slug: string; outcome: "published" | "merged" }
  | { step: "double_check"; message: string };

export type FlowAction =
  | { type: "submit_started" }
  | { type: "submit_result"; result: SubmitOutcome }
  | { type: "manual_requested" }
  | { type: "decide_yes"; competitionId: string }
  | { type: "decide_no" }
  | { type: "confirm_started" }
  | { type: "confirm_result"; result: ConfirmOutcome }
  | { type: "reset" };

export const initialFlow: FlowState = { step: "input" };

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "reset":
      return initialFlow;

    case "submit_started":
      return { step: "reading", manualRequested: false };

    case "manual_requested":
      // The student gave up waiting. Keep reading in the background, but the form will open blank.
      return state.step === "reading" ? { ...state, manualRequested: true } : state;

    case "submit_result": {
      if (state.step !== "reading") return state;
      const r = action.result;
      if (r.kind === "error") return { step: "input", error: r.message };
      if (r.kind === "queued") return { step: "queued", message: r.message };
      if (r.kind === "manual") {
        return {
          step: "review",
          submissionId: r.submissionId,
          preview: { status: "manual", reason: r.reason },
          imageUrl: r.imageUrl,
          match: null,
          decision: "separate",
          mergeInto: null,
          submitting: false,
        };
      }
      // The student asked to fill it in by hand while we were still reading: honor that, keep their blank form.
      const preview: PreviewState = state.manualRequested
        ? { status: "manual" }
        : { status: "ready", extraction: r.extraction, warning: r.warning };
      return {
        step: "review",
        submissionId: r.submissionId,
        preview,
        imageUrl: r.imageUrl,
        match: state.manualRequested ? null : r.match,
        decision: r.match && !state.manualRequested ? "undecided" : "separate",
        mergeInto: null,
        submitting: false,
      };
    }

    case "decide_yes":
      return state.step === "review"
        ? { ...state, decision: "merge", mergeInto: action.competitionId }
        : state;

    case "decide_no":
      return state.step === "review" ? { ...state, decision: "separate", mergeInto: null } : state;

    case "confirm_started":
      return state.step === "review"
        ? { ...state, submitting: true, serverErrors: undefined, banner: undefined }
        : state;

    case "confirm_result": {
      if (state.step !== "review") return state;
      const r = action.result;
      if (r.kind === "done") return { step: "done", slug: r.slug, outcome: r.outcome };
      if (r.kind === "queued") return { step: "double_check", message: r.message };
      if (r.kind === "invalid")
        return {
          ...state,
          submitting: false,
          serverErrors: r.errors,
          banner: "Please fix the highlighted fields.",
        };
      return { ...state, submitting: false, banner: r.message };
    }
  }
}

/** The duplicate prompt is shown until the student answers; the form waits behind it. */
export function showDuplicatePrompt(state: FlowState): boolean {
  return state.step === "review" && !!state.match && state.decision === "undecided";
}
