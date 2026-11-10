"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Input, Select, ToggleChip } from "@/components/ui";
import {
  type FieldFilters,
  activeFilterCount,
  applyFieldPatch,
  currentWindow,
  fieldHref,
  selectedCategories,
  windowPreset,
} from "@/lib/field-url";
import { categoryLabel } from "@/lib/labels";
import { CATEGORIES } from "@/lib/schemas";

/** The Field's filters. Every change rewrites the URL (shareable, back-button friendly). */
export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(params.get("q") ?? "");
  const lastPushed = useRef(params.get("q") ?? "");

  const push = (patch: Partial<FieldFilters>) => {
    const next = applyFieldPatch(new URLSearchParams(params.toString()), patch);
    startTransition(() => router.replace(fieldHref(next, pathname), { scroll: false }));
  };

  // Debounce the search box so we do not navigate on every keystroke.
  useEffect(() => {
    if (text === lastPushed.current) return;
    const id = setTimeout(() => {
      lastPushed.current = text;
      push({ q: text.trim() });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Keep the box in sync when the URL changes elsewhere (Clear filters, back button).
  useEffect(() => {
    const q = params.get("q") ?? "";
    if (q !== lastPushed.current) {
      lastPushed.current = q;
      setText(q);
    }
  }, [params]);

  const cats = selectedCategories(params);
  const count = activeFilterCount(params);
  const host = params.get("host");
  const flag = (k: string) => params.get(k) === "1" || params.get(k) === "true";

  return (
    <section aria-label="Filters" className="mb-6 space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            label="Search competitions"
            hideLabel
            type="search"
            placeholder="Search by name, host or topic"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={100}
          />
        </div>
        <Button
          variant="secondary"
          className="md:hidden"
          aria-expanded={open}
          aria-controls="filter-panel"
          onClick={() => setOpen((o) => !o)}
        >
          Filters{count > 0 ? ` (${count})` : ""}
        </Button>
      </div>

      <div id="filter-panel" className={`${open ? "block" : "hidden"} space-y-4 md:block`}>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Category</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <ToggleChip
                key={c}
                selected={cats.includes(c)}
                onChange={(on) =>
                  push({ categories: on ? [...cats, c] : cats.filter((x) => x !== c) })
                }
              >
                {categoryLabel(c)}
              </ToggleChip>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Format"
            value={params.get("format") ?? ""}
            onChange={(e) => push({ format: e.target.value })}
          >
            <option value="">Any format</option>
            <option value="in_person">In person</option>
            <option value="virtual">Virtual</option>
            <option value="hybrid">Hybrid</option>
          </Select>
          <Select
            label="Cost"
            value={params.get("cost") ?? ""}
            onChange={(e) => push({ cost: e.target.value })}
          >
            <option value="">Any cost</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </Select>
          <Select
            label="Deadline"
            value={currentWindow(params)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "7" || v === "30" || v === "any") push(windowPreset(v));
            }}
          >
            <option value="any">Any time</option>
            <option value="7">Next 7 days</option>
            <option value="30">Next 30 days</option>
            {currentWindow(params) === "custom" && <option value="custom">Custom range</option>}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToggleChip selected={flag("utd_only")} onChange={(on) => push({ utd_only: on })}>
            UTD students only
          </ToggleChip>
          <ToggleChip selected={flag("beginner")} onChange={(on) => push({ beginner: on })}>
            Beginner friendly
          </ToggleChip>
          <ToggleChip selected={flag("include_past")} onChange={(on) => push({ include_past: on })}>
            Include past
          </ToggleChip>
          {host && (
            <ToggleChip
              selected
              onChange={() => push({ host: undefined })}
              aria-label={`Remove host filter ${host}`}
            >
              Host: {host} ✕
            </ToggleChip>
          )}
          {count > 0 && (
            <Button variant="ghost" onClick={() => router.replace(pathname, { scroll: false })}>
              Clear filters ({count})
            </Button>
          )}
        </div>
      </div>
      <p className="sr-only" role="status">
        {pending ? "Updating results" : ""}
      </p>
    </section>
  );
}
