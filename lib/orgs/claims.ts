import { z } from "zod";

export const claimInputSchema = z.object({ note: z.string().trim().max(300).default("") });
export const claimDecisionSchema = z.object({ approve: z.boolean() });

export type ClaimStatus = "none" | "pending" | "approved" | "rejected";

/** What the org page should offer this viewer. */
export interface ClaimState {
  status: ClaimStatus;
  /** Someone (possibly another student) already holds the org. */
  claimed: boolean;
}

/** decide_org_claim() outcomes mapped to HTTP. */
export function decisionResponse(result: string): {
  status: number;
  body: { result?: string; error?: string; message?: string };
} {
  switch (result) {
    case "approved":
    case "rejected":
      return { status: 200, body: { result } };
    case "not_found":
      return { status: 404, body: { error: "not_found", message: "That claim does not exist." } };
    case "already_decided":
      return {
        status: 409,
        body: { error: "already_decided", message: "Someone already decided this claim." },
      };
    case "already_claimed":
      return {
        status: 409,
        body: {
          error: "already_claimed",
          message: "Another officer already holds this organization.",
        },
      };
    default:
      return { status: 500, body: { error: "unavailable" } };
  }
}
