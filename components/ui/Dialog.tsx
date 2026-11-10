"use client";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Modal built on the native <dialog>: the browser traps focus, makes the rest of the page inert,
 * closes on Escape and restores focus to the opener. Clicking the backdrop also closes it.
 */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop, not the content
      }}
      className={cn(
        "m-auto w-[min(92vw,32rem)] rounded-xl bg-court p-0 text-ink shadow-2xl backdrop:bg-scoreboard/70",
        className,
      )}
    >
      <div className="p-5">
        <h2 id={titleId} className="mb-3 text-2xl font-bold">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
