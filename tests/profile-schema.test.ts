import { describe, expect, it } from "vitest";
import { profileInputSchema } from "@/lib/schemas/profile";

describe("profileInputSchema", () => {
  it("accepts a complete onboarding payload and dedupes arrays", () => {
    const p = profileInputSchema.parse({
      major: "  Computer Science ",
      class_year: "junior",
      interests: ["hackathon", "hackathon", "case_competition"],
      roles: ["dev", "dev"],
      onboarded: true,
    });
    expect(p.major).toBe("Computer Science");
    expect(p.interests).toEqual(["hackathon", "case_competition"]);
    expect(p.roles).toEqual(["dev"]);
  });

  it("treats a blank major as null (clears it)", () => {
    expect(profileInputSchema.parse({ major: "   " }).major).toBeNull();
  });

  it("is partial: skipping only sets onboarded", () => {
    expect(profileInputSchema.parse({ onboarded: true })).toEqual({ onboarded: true });
  });

  it("rejects values outside the allowed sets and oversized text", () => {
    expect(profileInputSchema.safeParse({ class_year: "alumnus" }).success).toBe(false);
    expect(profileInputSchema.safeParse({ interests: ["underwater_basketweaving"] }).success).toBe(
      false,
    );
    expect(profileInputSchema.safeParse({ roles: ["ceo"] }).success).toBe(false);
    expect(profileInputSchema.safeParse({ major: "x".repeat(81) }).success).toBe(false);
  });

  it("cannot set privileged columns (unknown keys are stripped)", () => {
    const p = profileInputSchema.parse({
      onboarded: true,
      is_admin: true,
      reputation: 999,
      ics_token: "x",
    });
    expect(p).toEqual({ onboarded: true });
  });
});
