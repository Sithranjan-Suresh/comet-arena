import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/auth/session";

// Every admin page is per-user: never prerender or cache.
export const dynamic = "force-dynamic";
export const metadata = {
  title: { template: "%s | Admin", default: "Admin" },
  robots: { index: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Signed out -> login; signed in but not an admin -> 404 (do not reveal that /admin exists).
  await requireAdmin();
  return (
    <div>
      <h1 className="mb-4 text-4xl font-extrabold uppercase">Admin</h1>
      <AdminNav />
      {children}
    </div>
  );
}
