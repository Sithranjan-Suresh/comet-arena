"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Input,
  Select,
  Skeleton,
  Textarea,
  ToggleChip,
  buttonClasses,
} from "@/components/ui";
import { categoryLabel } from "@/lib/labels";
import { CATEGORIES, CLASS_YEARS, type Extraction } from "@/lib/schemas";
import {
  type FieldErrors,
  type FormValues,
  type StageForm,
  emptyForm,
  emptyStage,
  extractionToForm,
  fieldsNeedingReview,
  moveStage,
  validateForm,
} from "@/lib/submit/form";
import type { ConfirmInput } from "@/lib/submit/schema";

export type PreviewState =
  | { status: "reading" }
  | { status: "ready"; extraction: Extraction; warning: "recap" | "not_a_competition" | null }
  | { status: "manual"; reason?: string }
  | { status: "queued"; message: string };

/** After this long without an answer we offer to fill the form in by hand (product_spec §5). */
export const READING_TIMEOUT_MS = 10_000;

const REVIEW_HINT = "We were not sure about this one. Please check it.";
const yearLabel = (y: string) => y.charAt(0).toUpperCase() + y.slice(1);

function Reading({ onManual }: { onManual: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), READING_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <p className="text-lg font-semibold">Reading the flyer…</p>
      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
      {slow && (
        <div className="bg-chalk ring-court-dark rounded-lg p-4 ring-1">
          <p className="mb-2">This is taking longer than usual.</p>
          <Button variant="secondary" onClick={onManual}>
            Fill it in myself
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Report a Game, step 2: the extracted fields, every one editable, plus a rounds editor. Nothing is
 * published until the student confirms a title, at least one dated round, and a register link
 * (or ticks "no link yet"). Validation is the same schema the server uses.
 */
export function ExtractionPreview({
  state,
  onConfirm,
  onStartManual,
  submitting = false,
  serverErrors,
  mergeInto = null,
  imageUrl = null,
}: {
  state: PreviewState;
  onConfirm: (input: ConfirmInput) => void;
  onStartManual: () => void;
  submitting?: boolean;
  serverErrors?: FieldErrors;
  mergeInto?: string | null;
  imageUrl?: string | null;
}) {
  if (state.status === "reading") return <Reading onManual={onStartManual} />;
  if (state.status === "queued") {
    return (
      <div role="status" className="bg-turf text-chalk rounded-xl p-5">
        <p className="text-xl font-bold">{state.message}</p>
        <p className="text-chalk-muted mt-1 text-sm">
          It will show up on your Report a Game history once it is read.
        </p>
        <Link href="/field" className={`${buttonClasses("primary")} mt-4`}>
          Back to The Field
        </Link>
      </div>
    );
  }
  const extraction = state.status === "ready" ? state.extraction : null;
  return (
    <PreviewForm
      extraction={extraction}
      warning={state.status === "ready" ? state.warning : null}
      manualReason={state.status === "manual" ? state.reason : undefined}
      onConfirm={onConfirm}
      submitting={submitting}
      serverErrors={serverErrors}
      mergeInto={mergeInto}
      imageUrl={imageUrl}
    />
  );
}

function PreviewForm({
  extraction,
  warning,
  manualReason,
  onConfirm,
  submitting,
  serverErrors,
  mergeInto,
  imageUrl,
}: {
  extraction: Extraction | null;
  warning: "recap" | "not_a_competition" | null;
  manualReason?: string;
  onConfirm: (input: ConfirmInput) => void;
  submitting: boolean;
  serverErrors?: FieldErrors;
  mergeInto: string | null;
  imageUrl: string | null;
}) {
  const [v, setV] = useState<FormValues>(() =>
    extraction ? extractionToForm(extraction) : emptyForm(),
  );
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const errors = { ...serverErrors, ...clientErrors };
  const review = useMemo(
    () => (extraction ? fieldsNeedingReview(extraction) : new Set<string>()),
    [extraction],
  );
  const lowConfidence = !!extraction && extraction.confidence < 0.8;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setV((cur) => ({ ...cur, [key]: value }));
  const hint = (field: string) => (review.has(field) ? REVIEW_HINT : undefined);
  const setStage = (i: number, patch: Partial<StageForm>) =>
    setV((cur) => ({
      ...cur,
      stages: cur.stages.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }));

  // Move focus to the first invalid field so keyboard and screen-reader users land on the problem.
  useEffect(() => {
    if (Object.keys(clientErrors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [clientErrors]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateForm(v, { merge_into: mergeInto });
    if (result.errors) return setClientErrors(result.errors);
    setClientErrors({});
    onConfirm(result.input);
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="grid gap-8 md:grid-cols-[1fr_16rem]"
    >
      <div className="space-y-6">
        {manualReason !== undefined && (
          <p role="note" className="bg-chalk ring-court-dark rounded-lg p-3 text-sm ring-1">
            We could not read this one automatically{manualReason ? ` (${manualReason})` : ""}. Fill
            in what you can; every field is yours to edit.
          </p>
        )}
        {warning && (
          <p role="note" className="bg-chalk ring-warn rounded-lg p-3 text-sm ring-1">
            {warning === "recap"
              ? "This looks like a results post for a competition that already happened, not a new one."
              : "This does not look like a competition announcement."}{" "}
            You can still add it if we are wrong.
          </p>
        )}
        {lowConfidence && (
          <p role="note" className="bg-chalk ring-warn rounded-lg p-3 text-sm font-medium ring-1">
            We are not fully sure about this one. Please check each field before you publish.
          </p>
        )}

        {errors.merge_into && (
          <p
            role="alert"
            className="bg-critical/10 text-critical rounded-lg p-3 text-sm font-medium"
          >
            We could not link this to the existing listing. Go back and answer “No, it is a
            different one”, or try again.
          </p>
        )}

        <Input
          label="Title"
          value={v.title}
          onChange={(e) => set("title", e.target.value)}
          error={errors.title}
          hint={hint("title")}
          maxLength={140}
        />
        <Input
          label="Host (club or organization)"
          value={v.host}
          onChange={(e) => set("host", e.target.value)}
          error={errors.host}
          hint={hint("host")}
          maxLength={120}
        />

        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Category</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <ToggleChip
                key={c}
                selected={v.categories.includes(c)}
                onChange={(on) =>
                  set("categories", on ? [...v.categories, c] : v.categories.filter((x) => x !== c))
                }
              >
                {categoryLabel(c)}
              </ToggleChip>
            ))}
          </div>
          {errors.categories && (
            <p role="alert" className="text-critical mt-1 text-sm font-medium">
              {errors.categories}
            </p>
          )}
        </fieldset>

        <Textarea
          label="Description"
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
          error={errors.description}
          hint={hint("description")}
          maxLength={2000}
        />

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Rounds and deadlines (Central Time)</legend>
          {review.has("stages") && <p className="text-warn text-sm font-medium">{REVIEW_HINT}</p>}
          {v.stages.map((s, i) => (
            <div key={i} className="bg-chalk ring-court-dark space-y-3 rounded-lg p-3 ring-1">
              <Input
                label={`Round ${i + 1} name`}
                value={s.name}
                onChange={(e) => setStage(i, { name: e.target.value })}
                error={errors[`stages.${i}.name`]}
                placeholder="Registration closes"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Starts (optional)"
                  type="datetime-local"
                  value={s.starts}
                  onChange={(e) => setStage(i, { starts: e.target.value })}
                  error={errors[`stages.${i}.starts_at`]}
                />
                <Input
                  label="Due / ends"
                  type="datetime-local"
                  value={s.deadline}
                  onChange={(e) => setStage(i, { deadline: e.target.value })}
                  error={errors[`stages.${i}.deadline_at`]}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={i === 0}
                  aria-label={`Move round ${i + 1} up`}
                  onClick={() => set("stages", moveStage(v.stages, i, i - 1))}
                >
                  Move up
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={i === v.stages.length - 1}
                  aria-label={`Move round ${i + 1} down`}
                  onClick={() => set("stages", moveStage(v.stages, i, i + 1))}
                >
                  Move down
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={v.stages.length === 1}
                  aria-label={`Remove round ${i + 1}`}
                  onClick={() =>
                    set(
                      "stages",
                      v.stages.filter((_, idx) => idx !== i),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {errors.stages && (
            <p role="alert" className="text-critical text-sm font-medium">
              {errors.stages}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => set("stages", [...v.stages, emptyStage()])}
          >
            Add a round
          </Button>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Prize"
            value={v.prize}
            onChange={(e) => set("prize", e.target.value)}
            error={errors.prize}
            hint={hint("prize")}
          />
          <Input
            label="Where"
            value={v.location}
            onChange={(e) => set("location", e.target.value)}
            error={errors.location}
            hint={hint("location")}
          />
          <Select
            label="Cost"
            value={v.cost}
            onChange={(e) => set("cost", e.target.value as FormValues["cost"])}
          >
            <option value="unknown">Not listed</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </Select>
          <Select
            label="Format"
            value={v.format}
            onChange={(e) => set("format", e.target.value as FormValues["format"])}
          >
            <option value="unknown">Not listed</option>
            <option value="in_person">In person</option>
            <option value="virtual">Virtual</option>
            <option value="hybrid">Hybrid</option>
          </Select>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Who can enter</legend>
          <Input
            label="Majors (comma separated, blank means everyone)"
            value={v.majors}
            onChange={(e) => set("majors", e.target.value)}
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Class years">
            {CLASS_YEARS.map((y) => (
              <ToggleChip
                key={y}
                selected={v.classYears.includes(y)}
                onChange={(on) =>
                  set("classYears", on ? [...v.classYears, y] : v.classYears.filter((x) => x !== y))
                }
              >
                {yearLabel(y)}
              </ToggleChip>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Smallest team"
              type="number"
              min={1}
              value={v.teamMin}
              onChange={(e) => set("teamMin", e.target.value)}
              error={errors["eligibility.team_min"]}
            />
            <Input
              label="Largest team"
              type="number"
              min={1}
              value={v.teamMax}
              onChange={(e) => set("teamMax", e.target.value)}
              error={errors["eligibility.team_max"]}
            />
          </div>
        </fieldset>

        <div className="space-y-2">
          <Input
            label="Registration link"
            type="url"
            value={v.registerUrl}
            onChange={(e) => set("registerUrl", e.target.value)}
            error={errors.register_url}
            hint={hint("registerUrl")}
            placeholder="https://…"
          />
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={v.noLinkYet}
              onChange={(e) => set("noLinkYet", e.target.checked)}
            />
            <span>No link yet (the host has not posted one)</span>
          </label>
        </div>

        <Button type="submit" loading={submitting} className="w-full sm:w-auto">
          {mergeInto ? "Confirm this competition" : "Publish"}
        </Button>
      </div>

      {imageUrl && (
        <aside aria-label="Your flyer" className="md:sticky md:top-20 md:self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="The flyer you submitted"
            className="w-full rounded-lg shadow-md"
          />
        </aside>
      )}
    </form>
  );
}
