"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ELIGIBILITY_LABEL } from "@/lib/eligibility";
import type { EligibilityVerdict } from "@/lib/schemas";

/** "You qualify" / "Check eligibility" for the signed-in viewer (the page itself is cached and public). */
export function EligibilityCheck({ slug }: { slug: string }) {
  const { user, loading } = useAuth();
  const [verdict, setVerdict] = useState<EligibilityVerdict | null>(null);

  useEffect(() => {
    if (!user) {
      setVerdict(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/competitions/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { viewer_eligible?: EligibilityVerdict | null } | null) => {
        if (!cancelled) setVerdict(d?.viewer_eligible ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, slug]);

  if (loading) return null;
  if (!user) {
    return (
      <p className="text-ink-muted text-sm">
        <Link
          href={`/login?next=${encodeURIComponent(`/game/${slug}`)}`}
          className="font-semibold underline"
        >
          Sign in
        </Link>{" "}
        to see if you qualify.
      </p>
    );
  }
  if (!verdict) return null;

  const tone =
    verdict === "qualifies"
      ? "bg-good text-chalk"
      : verdict === "check"
        ? "bg-chalk text-ink ring-1 ring-warn"
        : "bg-chalk text-ink ring-1 ring-ink-muted";
  return (
    <p
      role="status"
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${tone}`}
    >
      {verdict === "qualifies" ? "✓ " : verdict === "check" ? "! " : ""}
      {ELIGIBILITY_LABEL[verdict]}
    </p>
  );
}
