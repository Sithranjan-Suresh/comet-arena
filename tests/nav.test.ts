import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isActive } from "@/lib/nav";

describe("nav", () => {
  it("lists the five tabs from the spec in order", () => {
    expect(NAV_ITEMS.map((n) => n.href)).toEqual([
      "/",
      "/field",
      "/schedule",
      "/free-agency",
      "/me",
    ]);
    expect(NAV_ITEMS.map((n) => n.label)).toEqual([
      "Scouting Report",
      "The Field",
      "Schedule",
      "Free Agency",
      "Player Card",
    ]);
  });

  it("matches / exactly but other tabs by prefix", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/field", "/")).toBe(false);
    expect(isActive("/field", "/field")).toBe(true);
    expect(isActive("/field/extra", "/field")).toBe(true);
    expect(isActive("/fieldwork", "/field")).toBe(false);
  });
});
