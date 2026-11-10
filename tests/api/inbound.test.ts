import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminMock, reset, world } from "./harness";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", async () => (await import("./harness")).adminMock);
import * as inbound from "../../app/api/inbound/email/route";

void adminMock;
const SECRET = "inbound-secret-0123456789";
const good = {
  from: "News <news@jsom.utdallas.edu>",
  subject: "Hi",
  text: "The Hackathon is on Saturday. Register to compete for prizes.",
  messageId: "<m1@x>",
};
const call = (
  body: unknown,
  opts: {
    secret?: string | null;
    via?: "header" | "query";
    type?: string;
    headers?: Record<string, string>;
  } = {},
) => {
  const secret = opts.secret === undefined ? SECRET : opts.secret;
  const url = `http://localhost/api/inbound/email${secret && opts.via === "query" ? `?secret=${secret}` : ""}`;
  const headers: Record<string, string> = {
    "content-type": opts.type ?? "application/json",
    ...(opts.headers ?? {}),
  };
  if (secret && opts.via !== "query") headers["x-webhook-secret"] = secret;
  return inbound.POST(
    new Request(url, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
};

beforeEach(() => {
  reset();
  vi.stubEnv("INBOUND_EMAIL_SECRET", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/inbound/email", () => {
  it("refuses a missing or wrong secret, and refuses everything when no secret is configured", async () => {
    expect((await call(good, { secret: null })).status).toBe(401);
    expect((await call(good, { secret: "wrong" })).status).toBe(401);
    vi.stubEnv("INBOUND_EMAIL_SECRET", "");
    expect((await call(good)).status).toBe(401);
  });

  it("stores a message from an allowed sender (secret in header or query)", async () => {
    expect(await (await call(good)).json()).toEqual({ accepted: true });
    expect(await (await call({ ...good, messageId: "<m2@x>" }, { via: "query" })).json()).toEqual({
      accepted: true,
    });
  });

  it("acknowledges but drops mail from senders that are not on the list", async () => {
    expect(await (await call({ ...good, from: "spam@evil.example" })).json()).toEqual({
      accepted: false,
    });
  });

  it("rejects unparseable bodies and payloads without sender, body or id", async () => {
    expect((await call("{not json")).status).toBe(400);
    expect((await call({ subject: "x" })).status).toBe(400);
    expect((await call({ ...good, messageId: "" })).status).toBe(400);
  });

  it("accepts form-encoded providers", async () => {
    const form = new URLSearchParams({
      from: good.from,
      subject: "S",
      text: good.text,
      "Message-Id": "<f1@x>",
    });
    const res = await inbound.POST(
      new Request("http://localhost/api/inbound/email", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-webhook-secret": SECRET,
        },
        body: form,
      }),
    );
    expect(await res.json()).toEqual({ accepted: true });
  });

  it("refuses oversized bodies and returns 503 (so the provider retries) when the database is down", async () => {
    expect((await call(good, { headers: { "content-length": "9999999" } })).status).toBe(413);
    world.result = { data: null, error: { message: "db down" }, count: null };
    expect((await call(good)).status).toBe(503);
  });
});
