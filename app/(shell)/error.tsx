"use client";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

/** Error boundary for shell routes: friendly message with a retry that re-renders the segment. */
export default function ShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console (and any attached error reporter) with the server digest.
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      message="We hit a snag loading this page. Your data is safe. Please try again."
      onRetry={reset}
    />
  );
}
