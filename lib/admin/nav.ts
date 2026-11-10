export interface AdminNavItem {
  href: string;
  label: string;
}

/** Admin sections (engineering_spec §2). Orgs lands with Task 103. */
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/ingest", label: "Ingest runs" },
];
