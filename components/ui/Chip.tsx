import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

const look = "inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-sm font-medium";

/** Static label chip. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn(look, "border-court-dark bg-court-dark/50 text-ink", className)}>
      {children}
    </span>
  );
}

interface ToggleChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  selected: boolean;
  onChange: (selected: boolean) => void;
}

/** Filter chip: a real button with aria-pressed (44px hit area via padding wrapper). */
export function ToggleChip({ selected, onChange, className, children, ...rest }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onChange(!selected)}
      className={cn(
        look,
        "min-h-11 cursor-pointer px-4 transition-colors",
        selected
          ? "border-turf bg-turf text-chalk"
          : "border-ink-muted bg-transparent text-ink hover:bg-court-dark",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
