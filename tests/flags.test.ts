import { describe, expect, it } from "vitest";
import { FLAG_FIELDS, FLAG_LABEL, confirmErrorStatus, flagInputSchema } from "@/lib/flags";

const ID = "10000000-0000-4000-8000-000000000001";

describe("flags", () => {
  it("accepts a valid flag and defaults the note", () => {
    expect(flagInputSchema.parse({ competition_id: ID, field: "dates" })).toEqual({
      competition_id: ID,
      field: "dates",
      note: "",
    });
  });
  it("rejects unknown fields, bad ids and long notes", () => {
    expect(flagInputSchema.safeParse({ competition_id: ID, field: "bogus" }).success).toBe(false);
    expect(flagInputSchema.safeParse({ competition_id: "nope", field: "dates" }).success).toBe(
      false,
    );
    expect(
      flagInputSchema.safeParse({ competition_id: ID, field: "dates", note: "x".repeat(501) })
        .success,
    ).toBe(false);
  });
  it("every field has a label and the list matches the database constraint", async () => {
    for (const f of FLAG_FIELDS) expect(FLAG_LABEL[f]).toBeTruthy();
    const sql = (await import("node:fs")).readFileSync(
      "supabase/migrations/20261110000020_flags_confirmations.sql",
      "utf8",
    );
    for (const f of FLAG_FIELDS) expect(sql).toContain(`'${f}'`);
  });
  it("maps confirm_competition errors to HTTP statuses", () => {
    expect(confirmErrorStatus("28000").status).toBe(401);
    expect(confirmErrorStatus("P0002").status).toBe(404);
    expect(confirmErrorStatus("42501").status).toBe(403);
    expect(confirmErrorStatus("22023").status).toBe(409);
    expect(confirmErrorStatus("XX000").status).toBe(500);
    expect(confirmErrorStatus(undefined).status).toBe(500);
  });
});
