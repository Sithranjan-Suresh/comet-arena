import { describe, expect, it } from "vitest";
import { PROTECTED_PREFIXES, loginPathFor, needsAuth } from "@/lib/auth/routes";

describe("needsAuth", () => {
  it.each([
    "/schedule",
    "/free-agency",
    "/me",
    "/settings",
    "/onboarding",
    "/report",
    "/admin",
    "/admin/review",
    "/me/entries",
  ])("%s requires sign-in", (p) => expect(needsAuth(p)).toBe(true));

  it.each([
    "/",
    "/field",
    "/game/ais-case",
    "/org/hackutd",
    "/login",
    "/auth/callback",
    "/api/competitions",
    "/meetings",
    "/schedules",
  ])("%s is public", (p) => expect(needsAuth(p)).toBe(false));

  it("does not treat look-alike prefixes as protected", () => {
    for (const p of PROTECTED_PREFIXES) expect(needsAuth(`${p}x`)).toBe(false);
  });
});

describe("loginPathFor", () => {
  it("encodes the return path and query", () => {
    expect(loginPathFor("/schedule", "?week=2")).toBe("/login?next=%2Fschedule%3Fweek%3D2");
  });
});
