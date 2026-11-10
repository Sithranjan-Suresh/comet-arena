"use client";
import Link from "next/link";
import { useReducer } from "react";
import { DuplicatePrompt } from "@/components/report/DuplicatePrompt";
import { ExtractionPreview } from "@/components/report/ExtractionPreview";
import { SourceInput } from "@/components/report/SourceInput";
import { Button, buttonClasses } from "@/components/ui";
import { postConfirm, postSubmission } from "@/lib/submit/api";
import { flowReducer, initialFlow, showDuplicatePrompt } from "@/lib/submit/flow";

/** Report a Game: link or flyer -> AI reads it -> student reviews -> published (or merged). */
export function ReportFlow() {
  const [state, dispatch] = useReducer(flowReducer, initialFlow);

  async function onSource(choice: { url: string } | { file: File }) {
    dispatch({ type: "submit_started" });
    dispatch({ type: "submit_result", result: await postSubmission(choice) });
  }

  async function onConfirm(payload: unknown) {
    if (state.step !== "review") return;
    dispatch({ type: "confirm_started" });
    dispatch({ type: "confirm_result", result: await postConfirm(state.submissionId, payload) });
  }

  if (state.step === "input") {
    return (
      <div className="space-y-4">
        {state.error && (
          <p role="alert" className="bg-critical/10 text-critical rounded-lg p-3 font-medium">
            {state.error}
          </p>
        )}
        <SourceInput onSubmit={onSource} />
      </div>
    );
  }

  if (state.step === "reading") {
    return (
      <ExtractionPreview
        state={{ status: "reading" }}
        onConfirm={() => {}}
        onStartManual={() => dispatch({ type: "manual_requested" })}
      />
    );
  }

  if (state.step === "queued") {
    return (
      <ExtractionPreview
        state={{ status: "queued", message: state.message }}
        onConfirm={() => {}}
        onStartManual={() => {}}
      />
    );
  }

  if (state.step === "done") {
    return (
      <div role="status" className="bg-turf text-chalk space-y-4 rounded-xl p-6">
        <h2 className="text-3xl font-bold">
          {state.outcome === "merged" ? "Thanks, confirmation added" : "It is on the field"}
        </h2>
        <p className="text-chalk-muted">
          {state.outcome === "merged"
            ? "Your confirmation helps other students trust this listing."
            : "Your competition is live and marked unverified until the host or a few students confirm it."}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/game/${state.slug}`} className={buttonClasses("primary")}>
            See the Game Day page
          </Link>
          <Button
            variant="ghost"
            className="text-chalk hover:bg-turf-light"
            onClick={() => dispatch({ type: "reset" })}
          >
            Report another
          </Button>
        </div>
      </div>
    );
  }

  // review
  return (
    <div className="space-y-6">
      {state.banner && (
        <p role="alert" className="bg-critical/10 text-critical rounded-lg p-3 font-medium">
          {state.banner}
        </p>
      )}
      {showDuplicatePrompt(state) && state.match ? (
        <DuplicatePrompt
          match={state.match}
          onYes={(competitionId) => dispatch({ type: "decide_yes", competitionId })}
          onNo={() => dispatch({ type: "decide_no" })}
        />
      ) : (
        <ExtractionPreview
          state={state.preview}
          onConfirm={onConfirm}
          onStartManual={() => {}}
          submitting={state.submitting}
          serverErrors={state.serverErrors}
          mergeInto={state.mergeInto}
          imageUrl={state.imageUrl}
        />
      )}
    </div>
  );
}
