export interface AdminNavItem {
  href: string;
  label: string;
}

/** Admin sections (engineering_spec §2). */
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/flags", label: "Flags" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/ingest", label: "Ingest runs" },
  { href: "/admin/orgs", label: "Orgs" },
];
