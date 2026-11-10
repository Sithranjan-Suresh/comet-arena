import { formatCT } from "./time";

export interface StageLike {
  name: string;
  starts_at: string | null;
  deadline_at: string;
  order?: number;
}

export type StageState = "past" | "next" | "upcoming";

export interface StageView<T extends StageLike = StageLike> {
  stage: T;
  /** "Q1", "Q2", ... (rounds are shown as quarters). */
  quarter: string;
  state: StageState;
  /** Human date text in CT. Date range when the stage spans days, otherwise the deadline. */
  when: string;
}

function dayKey(iso: string) {
  return formatCT(iso, "date");
}

/** Date text for a stage: "Nov 7 – Nov 8, 2026" for ranges, else "Nov 20, 2026, 11:59 PM CT". */
export function stageWhen(s: StageLike): string {
  if (s.starts_at && dayKey(s.starts_at) !== dayKey(s.deadline_at)) {
    return `${formatCT(s.starts_at, "date")} – ${formatCT(s.deadline_at, "date")}`;
  }
  return formatCT(s.deadline_at);
}

/** Sort stages, label them Q1..Qn and mark exactly one as "next" (first not yet past). */
export function buildStageViews<T extends StageLike>(
  stages: T[],
  now: Date = new Date(),
): StageView<T>[] {
  const sorted = [...stages].sort(
    (a, b) =>
      (a.order ?? 0) - (b.order ?? 0) ||
      new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime(),
  );
  let nextAssigned = false;
  return sorted.map((stage, i) => {
    const isPast = new Date(stage.deadline_at).getTime() < now.getTime();
    let state: StageState = "upcoming";
    if (isPast) state = "past";
    else if (!nextAssigned) {
      state = "next";
      nextAssigned = true;
    }
    return { stage, quarter: `Q${i + 1}`, state, when: stageWhen(stage) };
  });
}
