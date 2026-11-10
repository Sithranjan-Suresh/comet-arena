import { describe, expect, it, vi } from "vitest";
import {
  getPendingHandler,
  registerPendingHandler,
  savePendingAction,
  takePendingAction,
} from "@/lib/pending-action";

class FakeStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}
const id = "11111111-1111-4111-8111-111111111111";

describe("pending action storage", () => {
  it("round-trips an action and clears it after reading", () => {
    const s = new FakeStorage();
    expect(savePendingAction({ type: "save", competitionId: id }, s, 1000)).toBe(true);
    expect(takePendingAction(s, 2000)).toEqual({ type: "save", competitionId: id });
    expect(takePendingAction(s, 2000)).toBeNull(); // consumed
  });

  it("discards expired actions (older than 30 minutes)", () => {
    const s = new FakeStorage();
    savePendingAction({ type: "save", competitionId: id }, s, 0);
    expect(takePendingAction(s, 31 * 60_000)).toBeNull();
  });

  it("discards malformed or tampered entries", () => {
    const s = new FakeStorage();
    s.setItem("comet:pending-action", "{not json");
    expect(takePendingAction(s)).toBeNull();
    s.setItem(
      "comet:pending-action",
      JSON.stringify({ at: Date.now(), action: { type: "save", competitionId: "nope" } }),
    );
    expect(takePendingAction(s)).toBeNull();
    s.setItem(
      "comet:pending-action",
      JSON.stringify({ at: Date.now(), action: { type: "delete_everything" } }),
    );
    expect(takePendingAction(s)).toBeNull();
  });

  it("is safe when storage is unavailable", () => {
    expect(savePendingAction({ type: "save", competitionId: id }, null)).toBe(false);
    expect(takePendingAction(null)).toBeNull();
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {},
    };
    expect(savePendingAction({ type: "save", competitionId: id }, throwing)).toBe(false);
    expect(takePendingAction(throwing)).toBeNull();
  });
});

describe("handlers", () => {
  it("has a default save handler and supports replace/unregister", () => {
    expect(getPendingHandler("save")).toBeTypeOf("function");
    const original = getPendingHandler("save")!;
    const custom = vi.fn(async () => "ok");
    const off = registerPendingHandler("save", custom);
    expect(getPendingHandler("save")).toBe(custom);
    off();
    expect(getPendingHandler("save")).toBeUndefined();
    registerPendingHandler("save", original); // restore
  });
});
