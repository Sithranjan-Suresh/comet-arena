import { describe, expect, it } from "vitest";
import { authErrorMessage, classifyCallbackError } from "@/lib/auth/errors";
import { isUtdEmail } from "@/lib/auth/email";
import { safeNextPath } from "@/lib/auth/redirect";

describe("isUtdEmail", () => {
  it.each(["a@utdallas.edu", "A.B@UTDallas.edu", "x@student.utdallas.edu", " y@utdallas.edu "])(
    "accepts %s",
    (e) => expect(isUtdEmail(e)).toBe(true),
  );
  it.each([
    "a@gmail.com",
    "a@utdallas.edu.evil.com",
    "a@evilutdallas.edu",
    "a@utdallas.com",
    "utdallas.edu",
    "@utdallas.edu",
    "",
  ])("rejects %s", (e) => expect(isUtdEmail(e)).toBe(false));
});

describe("safeNextPath", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/game/ais-case?tab=board")).toBe("/game/ais-case?tab=board");
    expect(safeNextPath("/")).toBe("/");
  });

  it.each([
    "//evil.com",
    "https://evil.com",
    "http://evil.com/x",
    "/\\evil.com",
    "javascript:alert(1)",
    "evil.com",
    "/ok\r\nSet-Cookie: x=1",
    "",
    null,
    undefined,
  ])("falls back for %s", (n) => expect(safeNextPath(n as string)).toBe("/"));

  it("honors a custom fallback", () => {
    expect(safeNextPath("//x", "/field")).toBe("/field");
  });
});

describe("auth errors", () => {
  it("maps the DB trigger failure to the friendly UTD message", () => {
    const code = classifyCallbackError({
      error: "server_error",
      error_description: "Database error saving new user",
    });
    expect(code).toBe("utd_email");
    expect(authErrorMessage(code)).toBe("Use your @utdallas.edu address to sign in.");
  });

  it("maps cancellations and unknown failures", () => {
    expect(
      classifyCallbackError({ error: "access_denied", error_description: "user denied" }),
    ).toBe("access_denied");
    expect(classifyCallbackError({ error: "weird" })).toBe("callback_failed");
    expect(classifyCallbackError({})).toBeNull();
  });

  it("never returns an empty message for an unknown code", () => {
    expect(authErrorMessage("nonsense")).toMatch(/try again/i);
    expect(authErrorMessage(null)).toBeNull();
  });
});
