import { z } from "zod";

/** An action the user tried while signed out; completed automatically after they sign in. */
export const pendingActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("save"), competitionId: z.string().uuid() }),
]);
export type PendingAction = z.infer<typeof pendingActionSchema>;

const KEY = "comet:pending-action";
const TTL_MS = 30 * 60_000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // storage disabled (private mode etc.)
  }
}

export function savePendingAction(
  action: PendingAction,
  storage: StorageLike | null = defaultStorage(),
  now: number = Date.now(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify({ action, at: now }));
    return true;
  } catch {
    return false;
  }
}

/** Read AND clear the pending action. Expired or malformed entries are discarded. */
export function takePendingAction(
  storage: StorageLike | null = defaultStorage(),
  now: number = Date.now(),
): PendingAction | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(KEY);
    storage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { action?: unknown; at?: unknown };
    if (typeof parsed.at !== "number" || now - parsed.at > TTL_MS) return null;
    const result = pendingActionSchema.safeParse(parsed.action);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

type Handler = (action: PendingAction) => Promise<string | void>;
const handlers = new Map<PendingAction["type"], Handler>();

/** Register how an action type is completed. Returns an unregister function. */
export function registerPendingHandler(type: PendingAction["type"], handler: Handler): () => void {
  handlers.set(type, handler);
  return () => {
    if (handlers.get(type) === handler) handlers.delete(type);
  };
}

export function getPendingHandler(type: PendingAction["type"]): Handler | undefined {
  return handlers.get(type);
}

// Default: saving a competition (API from Task 59).
registerPendingHandler("save", async (action) => {
  if (action.type !== "save") return;
  const res = await fetch("/api/saves", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ competition_id: action.competitionId }),
  });
  if (!res.ok) throw new Error(`save failed (${res.status})`);
  return "Saved. Its deadlines are on your schedule.";
});
