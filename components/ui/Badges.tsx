import type { Category, CompetitionStatus, Role } from "@/lib/schemas";
import { cn } from "@/lib/cn";
import { CATEGORY_META, categoryLabel, roleLabel, verifyMeta } from "@/lib/labels";

const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold";

/** Category label with a color dot. The dot is decorative; the text carries the meaning. */
export function CategoryBadge({
  category,
  className,
}: {
  category: Category | string;
  className?: string;
}) {
  const meta = (CATEGORY_META as Record<string, { dot: string }>)[category];
  return (
    <span className={cn(pill, "bg-chalk text-ink ring-1 ring-court-dark", className)}>
      <span
        aria-hidden="true"
        className="size-2 rounded-full"
        style={{ background: meta?.dot ?? "#5a554b" }}
      />
      {categoryLabel(category)}
    </span>
  );
}

const verifyStyles = {
  verified: "bg-good text-chalk",
  unverified: "bg-chalk text-ink ring-1 ring-warn",
  expected: "bg-chalk text-ink ring-1 ring-ink-muted",
  past: "bg-ink-muted text-chalk",
} as const;

const verifyIcon = { verified: "✓", unverified: "!", expected: "~", past: "•" } as const;

/** Verification state. Never color-only: icon + text + hidden description. */
export function VerifyBadge({
  status,
  className,
}: {
  status: CompetitionStatus;
  className?: string;
}) {
  const meta = verifyMeta(status);
  return (
    <span className={cn(pill, verifyStyles[meta.tone], className)} title={meta.description}>
      <span aria-hidden="true">{verifyIcon[meta.tone]}</span>
      {meta.label}
      <span className="sr-only">. {meta.description}</span>
    </span>
  );
}

/** Role a student offers or a team needs. */
export function RoleChip({ role, className }: { role: Role | string; className?: string }) {
  return <span className={cn(pill, "bg-turf text-chalk", className)}>{roleLabel(role)}</span>;
}
