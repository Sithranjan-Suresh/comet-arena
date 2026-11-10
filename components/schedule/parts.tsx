import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { safeExternalUrl } from "@/lib/format";
import { type ScheduleStage, type ScheduleWeek, stageWhenLine } from "@/lib/schedule";

/** One stage deadline: what is due, for which competition, when (CT), with a live countdown. */
export function StageRow({ stage, past = false }: { stage: ScheduleStage; past?: boolean }) {
  const register = safeExternalUrl(stage.register_url);
  return (
    <li className="bg-chalk ring-court-dark flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 ring-1">
      <div className="min-w-0">
        <p className="font-semibold">
          <Link href={`/game/${stage.slug}`} className="underline-offset-2 hover:underline">
            {stage.title}
          </Link>
        </p>
        <p className="text-ink-muted text-sm">
          {stage.stage_name} · {stageWhenLine(stage)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {!past && <Countdown deadline={stage.deadline_at} />}
        {!past && register && (
          <a
            href={register}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold underline"
          >
            Register<span className="sr-only"> for {stage.title} (opens in a new tab)</span>
          </a>
        )}
      </div>
    </li>
  );
}

export function WeekGroup({ week }: { week: ScheduleWeek }) {
  return (
    <section aria-labelledby={`week-${week.key}`}>
      <h2 id={`week-${week.key}`} className="mb-2 text-2xl font-bold">
        {week.label}
      </h2>
      <ul className="space-y-2">
        {week.stages.map((s) => (
          <StageRow key={s.stage_id} stage={s} />
        ))}
      </ul>
    </section>
  );
}

/** Past stages, collapsed by default so the schedule stays about what is next. */
export function PastStages({ stages }: { stages: ScheduleStage[] }) {
  if (stages.length === 0) return null;
  return (
    <details className="rounded-lg">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        Past deadlines ({stages.length})
      </summary>
      <ul className="mt-2 space-y-2 opacity-80">
        {stages.map((s) => (
          <StageRow key={s.stage_id} stage={s} past />
        ))}
      </ul>
    </details>
  );
}
