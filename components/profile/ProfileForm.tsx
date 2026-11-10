"use client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, Input, ToggleChip } from "@/components/ui";
import { MAJOR_SUGGESTIONS } from "@/lib/majors";
import { categoryLabel, roleLabel } from "@/lib/labels";
import { CATEGORIES, CLASS_YEARS, ROLES } from "@/lib/schemas";
import type { ProfileData } from "@/lib/schemas/profile";

const classYearLabel: Record<string, string> = {
  freshman: "Freshman",
  sophomore: "Sophomore",
  junior: "Junior",
  senior: "Senior",
  graduate: "Graduate",
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

interface Props {
  initial: ProfileData;
  /** onboarding: shows Skip and marks the profile as onboarded. settings: also shows notification toggles. */
  mode: "onboarding" | "settings";
  next?: string;
}

export function ProfileForm({ initial, mode, next = "/" }: Props) {
  const router = useRouter();
  const listId = useId();
  const [major, setMajor] = useState(initial.major ?? "");
  const [classYear, setClassYear] = useState<string | null>(initial.class_year);
  const [interests, setInterests] = useState<string[]>(initial.interests);
  const [roles, setRoles] = useState<string[]>(initial.roles);
  const [warnings, setWarnings] = useState(initial.email_warnings);
  const [digest, setDigest] = useState(initial.digest);
  const [publicResults, setPublicResults] = useState(initial.public_results);
  const [saving, setSaving] = useState<"save" | "skip" | null>(null);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  async function submit(kind: "save" | "skip") {
    setSaving(kind);
    setError(undefined);
    setSaved(false);
    const body =
      kind === "skip"
        ? { onboarded: true }
        : {
            major: major.trim() || null,
            class_year: classYear,
            interests,
            roles,
            onboarded: true,
            ...(mode === "settings"
              ? { email_warnings: warnings, digest, public_results: publicResults }
              : {}),
          };
    try {
      const res = await fetch("/api/me/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      if (mode === "onboarding") {
        router.push(next);
        router.refresh();
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("We could not save your profile. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit("save");
      }}
      className="space-y-8"
    >
      <div>
        <Input
          label="Major"
          list={listId}
          value={major}
          onChange={(e) => setMajor(e.target.value)}
          placeholder="Start typing, e.g. Computer Science"
          hint="Used to show competitions you are eligible for."
          autoComplete="off"
          maxLength={80}
        />
        <datalist id={listId}>
          {MAJOR_SUGGESTIONS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Class year</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Class year">
          {CLASS_YEARS.map((y) => (
            <ToggleChip
              key={y}
              selected={classYear === y}
              onChange={(on) => setClassYear(on ? y : null)}
              role="radio"
              aria-checked={classYear === y}
            >
              {classYearLabel[y]}
            </ToggleChip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">What do you want to compete in?</legend>
        <p className="text-ink-muted mb-2 text-sm">
          Pick any. We rank these higher in your Scouting Report.
        </p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <ToggleChip
              key={c}
              selected={interests.includes(c)}
              onChange={() => setInterests((cur) => toggle(cur, c))}
            >
              {categoryLabel(c)}
            </ToggleChip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Roles you can play on a team</legend>
        <p className="text-ink-muted mb-2 text-sm">
          Teams looking for these roles can find you in Free Agency.
        </p>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <ToggleChip
              key={r}
              selected={roles.includes(r)}
              onChange={() => setRoles((cur) => toggle(cur, r))}
            >
              {roleLabel(r)}
            </ToggleChip>
          ))}
        </div>
      </fieldset>

      {mode === "settings" && (
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-semibold">Email</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={warnings}
              onChange={(e) => setWarnings(e.target.checked)}
            />
            <span>Deadline warnings (7 days and 1 day before each stage)</span>
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={digest}
              onChange={(e) => setDigest(e.target.checked)}
            />
            <span>Weekly digest (Sundays, 6 PM CT)</span>
          </label>
        </fieldset>
      )}

      {mode === "settings" && (
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-semibold">Privacy</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={publicResults}
              onChange={(e) => setPublicResults(e.target.checked)}
            />
            <span>
              Show my first name and last initial on past-winners lists when a host confirms I
              placed
            </span>
          </label>
          <p className="text-ink-muted text-sm">
            Off by default. Your Player Card stays private either way.
          </p>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="text-critical text-sm font-medium">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-good text-sm font-medium">
          Saved.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving === "save"} disabled={saving === "skip"}>
          {mode === "onboarding" ? "Finish" : "Save changes"}
        </Button>
        {mode === "onboarding" && (
          <Button
            variant="ghost"
            loading={saving === "skip"}
            disabled={saving === "save"}
            onClick={() => void submit("skip")}
          >
            Skip for now
          </Button>
        )}
      </div>
    </form>
  );
}
