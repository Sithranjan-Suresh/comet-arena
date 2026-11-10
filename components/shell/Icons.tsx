import type { NavItem } from "@/lib/nav";

const common = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export function NavIcon({ name }: { name: NavItem["icon"] }) {
  switch (name) {
    case "scout":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
        </svg>
      );
    case "field":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M12 5v14M3 12h4M17 12h4" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "schedule":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M8 2v4M16 2v4M3 10h18" />
        </svg>
      );
    case "agency":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a3 3 0 1 0 0-6M21 20c0-2.5-1.6-4.6-4-5.5" />
        </svg>
      );
    case "card":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <circle cx="12" cy="10" r="3" />
          <path d="M7 18c.8-2 2.6-3 5-3s4.2 1 5 3" />
        </svg>
      );
  }
}

/** Comet mark: a star with a tail. */
export function CometMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <path d="M26 4 15 15l4 4L26 4Z" fill="currentColor" />
      <path
        d="M13 17 4 28M16 20 9 29M11 15 3 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
