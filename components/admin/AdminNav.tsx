"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "@/lib/admin/nav";
import { isActive } from "@/lib/nav";

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="mb-8 flex flex-wrap gap-2 border-b border-current/10 pb-3">
      {ADMIN_NAV.map((item) => {
        const active =
          item.href === "/admin" ? pathname === "/admin" : isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${active ? "bg-turf text-chalk" : "hover:bg-chalk"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
