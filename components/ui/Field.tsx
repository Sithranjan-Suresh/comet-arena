import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
  useId,
} from "react";
import { cn } from "@/lib/cn";

const control =
  "min-h-11 w-full rounded-lg border border-ink-muted bg-chalk px-3 py-2 text-ink placeholder:text-ink-muted " +
  "disabled:opacity-50 aria-[invalid=true]:border-critical aria-[invalid=true]:border-2";

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  /** Visually hide the label (it stays available to screen readers). */
  hideLabel?: boolean;
  className?: string;
}

/** Shared wiring: label, hint and error are associated with the control via ids. */
function useFieldIds(id?: string) {
  const auto = useId();
  const base = id ?? auto;
  return { id: base, hintId: `${base}-hint`, errorId: `${base}-error` };
}

function Shell({
  ids,
  label,
  hint,
  error,
  hideLabel,
  className,
  children,
}: FieldShellProps & { ids: ReturnType<typeof useFieldIds>; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={ids.id} className={cn("text-sm font-semibold", hideLabel && "sr-only")}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={ids.hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={ids.errorId} role="alert" className="text-sm font-medium text-critical">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(ids: ReturnType<typeof useFieldIds>, hint?: string, error?: string) {
  return error ? ids.errorId : hint ? ids.hintId : undefined;
}

export const Input = forwardRef<
  HTMLInputElement,
  FieldShellProps & Omit<InputHTMLAttributes<HTMLInputElement>, "className">
>(function Input({ label, hint, error, hideLabel, className, id, ...rest }, ref) {
  const ids = useFieldIds(id);
  return (
    <Shell ids={ids} {...{ label, hint, error, hideLabel, className }}>
      <input
        ref={ref}
        id={ids.id}
        className={control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(ids, hint, error)}
        {...rest}
      />
    </Shell>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  FieldShellProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">
>(function Textarea({ label, hint, error, hideLabel, className, id, ...rest }, ref) {
  const ids = useFieldIds(id);
  return (
    <Shell ids={ids} {...{ label, hint, error, hideLabel, className }}>
      <textarea
        ref={ref}
        id={ids.id}
        rows={3}
        className={control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(ids, hint, error)}
        {...rest}
      />
    </Shell>
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  FieldShellProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">
>(function Select({ label, hint, error, hideLabel, className, id, children, ...rest }, ref) {
  const ids = useFieldIds(id);
  return (
    <Shell ids={ids} {...{ label, hint, error, hideLabel, className }}>
      <select
        ref={ref}
        id={ids.id}
        className={control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(ids, hint, error)}
        {...rest}
      >
        {children}
      </select>
    </Shell>
  );
});
