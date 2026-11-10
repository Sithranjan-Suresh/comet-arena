import { z } from "zod";

/** What a student can say is wrong. Mirrors the CHECK constraint on `flags.field`. */
export const FLAG_FIELDS = [
  "title",
  "dates",
  "link",
  "prize",
  "eligibility",
  "cancelled",
  "duplicate",
  "other",
] as const;
export type FlagField = (typeof FLAG_FIELDS)[number];

export const FLAG_LABEL: Record<FlagField, string> = {
  title: "The title or host is wrong",
  dates: "A date or deadline is wrong",
  link: "The registration link is broken or wrong",
  prize: "The prize or cost is wrong",
  eligibility: "Who can enter is wrong",
  cancelled: "This was cancelled or already happened",
  duplicate: "This is a duplicate of another listing",
  other: "Something else",
};

export const flagInputSchema = z.object({
  competition_id: z.string().uuid(),
  field: z.enum(FLAG_FIELDS),
  note: z.string().trim().max(500).default(""),
});
export type FlagInput = z.infer<typeof flagInputSchema>;

/** Confirmations needed before an unverified listing becomes live (enforced by a database trigger). */
export const CONFIRMATIONS_TO_VERIFY = 3;

export type ConfirmResponse = { confirmations: number; status: string; already: boolean };

/** Map confirm_competition()'s SQLSTATEs to HTTP statuses. */
export function confirmErrorStatus(code: string | undefined): {
  status: number;
  error: string;
  message: string;
} {
  switch (code) {
    case "28000":
      return {
        status: 401,
        error: "unauthorized",
        message: "Sign in with your @utdallas.edu account.",
      };
    case "P0002":
      return { status: 404, error: "not_found", message: "We could not find that competition." };
    case "42501":
      return {
        status: 403,
        error: "own_submission",
        message:
          "You reported this one, so it already counts. Another student needs to confirm it.",
      };
    case "22023":
      return { status: 409, error: "closed", message: "This competition is over." };
    default:
      return { status: 500, error: "unavailable", message: "Something went wrong. Try again." };
  }
}
