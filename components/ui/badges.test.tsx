// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryBadge, RoleChip, VerifyBadge } from "@/components/ui";
import { categoryLabel, roleLabel, verifyMeta } from "@/lib/labels";
import { CATEGORIES, COMPETITION_STATUSES, ROLES } from "@/lib/schemas";

describe("labels", () => {
  it("has a human label for every category and role", () => {
    for (const c of CATEGORIES) expect(categoryLabel(c)).not.toMatch(/_/);
    for (const r of ROLES) expect(roleLabel(r)).toBeTruthy();
  });

  it("falls back gracefully for unknown values", () => {
    expect(categoryLabel("new_thing")).toBe("new thing");
    expect(roleLabel("mystery")).toBe("mystery");
  });

  it("maps every status to a non-empty label and description", () => {
    for (const s of COMPETITION_STATUSES) {
      const m = verifyMeta(s);
      expect(m.label).toBeTruthy();
      expect(m.description.length).toBeGreaterThan(10);
    }
  });

  it("treats live as verified and unverified honestly", () => {
    expect(verifyMeta("live").tone).toBe("verified");
    expect(verifyMeta("unverified").label).toBe("Unverified");
  });
});

describe("badges", () => {
  it("CategoryBadge renders the readable label", () => {
    render(<CategoryBadge category="case_competition" />);
    expect(screen.getByText("Case comp")).toBeInTheDocument();
  });

  it("VerifyBadge exposes meaning to screen readers, not just color", () => {
    render(<VerifyBadge status="unverified" />);
    expect(screen.getByText(/Not yet confirmed by the host/)).toHaveClass("sr-only");
    expect(screen.getByText("Unverified", { exact: false })).toBeInTheDocument();
  });

  it("RoleChip shows the role label", () => {
    render(<RoleChip role="dev" />);
    expect(screen.getByText("Developer")).toBeInTheDocument();
  });
});
