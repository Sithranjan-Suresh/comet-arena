// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/ingest" }));
import { AdminNav } from "@/components/admin/AdminNav";
import { ADMIN_NAV } from "@/lib/admin/nav";

describe("AdminNav", () => {
  it("links every section and marks only the current one", () => {
    render(<AdminNav />);
    for (const i of ADMIN_NAV)
      expect(screen.getByRole("link", { name: i.label })).toHaveAttribute("href", i.href);
    expect(screen.getByRole("link", { name: "Ingest runs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
});
