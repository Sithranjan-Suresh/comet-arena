import { cn } from "@/lib/cn";
import { type StageLike, buildStageViews } from "@/lib/stages";

const stateText = { past: "Done", next: "Next up", upcoming: "Upcoming" } as const;

/**
 * Rounds as quarters. State is conveyed by text and aria-current, not by color alone.
 * Pass `now` for deterministic rendering (tests, ISR snapshots).
 */
export function StageTimeline({
  stages,
  now,
  className,
}: {
  stages: StageLike[];
  now?: Date;
  className?: string;
}) {
  if (stages.length === 0) {
    return <p className={cn("text-ink-muted", className)}>Dates not announced yet.</p>;
  }
  const views = buildStageViews(stages, now);
  return (
    <ol aria-label="Competition stages" className={cn("relative space-y-4", className)}>
      {views.map(({ stage, quarter, state, when }, i) => (
        <li
          key={`${stage.name}-${stage.deadline_at}`}
          aria-current={state === "next" ? "step" : undefined}
          className="relative flex gap-4"
        >
          {i < views.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute top-12 bottom-[-1rem] left-6 w-0.5 bg-court-dark"
            />
          )}
          <span
            aria-hidden="true"
            className={cn(
              "font-display flex size-12 shrink-0 items-center justify-center rounded-full text-xl font-extrabold",
              state === "next" && "bg-utd-orange text-ink",
              state === "upcoming" && "bg-turf text-chalk",
              state === "past" && "bg-court-dark text-ink-muted",
            )}
          >
            {quarter}
          </span>
          <div className="min-w-0 pt-1">
            <p className={cn("font-semibold", state === "past" && "text-ink-muted line-through")}>
              <span className="sr-only">{quarter}: </span>
              {stage.name}
            </p>
            <p className="text-sm text-ink-muted">{when}</p>
            <p
              className={cn(
                "mt-0.5 inline-block text-xs font-semibold tracking-wide uppercase",
                state === "next" ? "text-warn" : "text-ink-muted",
              )}
            >
              {stateText[state]}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
