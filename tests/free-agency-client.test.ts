import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeFreeAgent,
  contactHref,
  fetchBoard,
  patchOpening,
  postFreeAgent,
  postOpening,
} from "@/lib/free-agency-client";

const C = "00000000-0000-4000-8000-0000000000c1";
const res = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
afterEach(() => vi.unstubAllGlobals());

describe("Free Agency client", () => {
  it("posts free agents and openings as JSON to the right endpoints", async () => {
    const f = vi.fn(async (...[,]: [string, RequestInit?]) => res(201, { id: "x" }));
    vi.stubGlobal("fetch", f);
    expect(await postFreeAgent(C, ["dev"], "hi")).toEqual({ ok: true, data: { id: "x" } });
    await postOpening(C, "Comet Coders", ["design"], "");
    await closeFreeAgent("fa1");
    await patchOpening("op1", { note: "x" });
    const urls = f.mock.calls.map((c) => `${(c[1] as RequestInit).method} ${c[0]}`);
    expect(urls).toEqual([
      "POST /api/free-agents",
      "POST /api/team-openings",
      "PATCH /api/free-agents/fa1",
      "PATCH /api/team-openings/op1",
    ]);
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      competition_id: C,
      roles: ["dev"],
      note: "hi",
    });
  });

  it("turns failures into friendly messages, never throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(409, { message: "Registration for this competition has closed." })),
    );
    expect(await postFreeAgent(C, ["dev"], "")).toEqual({
      ok: false,
      status: 409,
      message: "Registration for this competition has closed.",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(401, {})),
    );
    expect(await postFreeAgent(C, ["dev"], "")).toMatchObject({
      ok: false,
      status: 401,
      message: expect.stringContaining("Sign in"),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(500, "nope")),
    );
    expect(await postFreeAgent(C, ["dev"], "")).toMatchObject({
      ok: false,
      message: "Something went wrong. Please try again.",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    expect(await postFreeAgent(C, ["dev"], "")).toMatchObject({
      ok: false,
      status: 0,
      message: expect.stringContaining("connection"),
    });
  });

  it("fetches the board with an optional role filter and throws on errors (for the query layer)", async () => {
    const f = vi.fn(async (...[,]: [string, RequestInit?]) =>
      res(200, { free_agents: [], openings: [] }),
    );
    vi.stubGlobal("fetch", f);
    await fetchBoard("ais-case");
    await fetchBoard("ais-case", "design");
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      "/api/competitions/ais-case/board",
      "/api/competitions/ais-case/board?role=design",
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(503, {})),
    );
    await expect(fetchBoard("x")).rejects.toThrow("board 503");
  });

  it("builds a mailto link with an encoded subject", () => {
    expect(contactHref("ada@utdallas.edu", "AIS Case & More")).toBe(
      "mailto:ada@utdallas.edu?subject=Teaming%20up%20for%20AIS%20Case%20%26%20More%20(Comet%20Arena)",
    );
  });
});
