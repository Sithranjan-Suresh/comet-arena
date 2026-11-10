import type { ReactNode } from "react";
import { Button } from "./Button";

/** Empty list/page. Always offer a next action. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-court-dark px-6 py-12 text-center">
      <h2 className="text-2xl font-bold">{title}</h2>
      {description && <p className="max-w-prose text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}

/** Recoverable error with a retry action. */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl bg-critical/10 px-6 py-10 text-center"
    >
      <h2 className="text-2xl font-bold text-critical">{title}</h2>
      {message && <p className="max-w-prose">{message}</p>}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
