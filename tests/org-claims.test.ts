import { describe, expect, it } from "vitest";
import { claimDecisionSchema, claimInputSchema, decisionResponse } from "@/lib/orgs/claims";

describe("claims", () => {
  it("note is optional, trimmed and capped at 300 characters", () => {
    expect(claimInputSchema.parse({})).toEqual({ note: "" });
    expect(claimInputSchema.parse({ note: "  president  " }).note).toBe("president");
    expect(claimInputSchema.safeParse({ note: "x".repeat(301) }).success).toBe(false);
  });
  it("a decision must say approve true or false", () => {
    expect(claimDecisionSchema.safeParse({ approve: true }).success).toBe(true);
    expect(claimDecisionSchema.safeParse({}).success).toBe(false);
    expect(claimDecisionSchema.safeParse({ approve: "yes" }).success).toBe(false);
  });
  it("maps every decide_org_claim outcome to an HTTP response", () => {
    expect(decisionResponse("approved")).toEqual({ status: 200, body: { result: "approved" } });
    expect(decisionResponse("rejected").status).toBe(200);
    expect(decisionResponse("not_found").status).toBe(404);
    expect(decisionResponse("already_decided").status).toBe(409);
    expect(decisionResponse("already_claimed").status).toBe(409);
    expect(decisionResponse("???").status).toBe(500);
  });
});
