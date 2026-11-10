"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { NavIcon } from "./Icons";

/** Desktop top-bar links. */
export function TopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "font-display inline-flex min-h-11 items-center rounded-md px-3 text-lg font-bold tracking-wide uppercase",
                  active ? "bg-chalk text-turf" : "text-chalk hover:bg-turf-light",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile bottom tab bar (fixed). */
export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-turf-light bg-turf pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold",
                  "text-chalk border-t-4",
                  active ? "border-utd-orange bg-turf-light" : "border-transparent",
                )}
              >
                <NavIcon name={item.icon} />
                <span aria-hidden="true">{item.short}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
