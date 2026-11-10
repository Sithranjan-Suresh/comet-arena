import type { EntryRow } from "@/lib/entries";
import type { EntryResult as ResultKind } from "@/lib/schemas";

/** Human labels for the result enum, shared by the dialog and the Player Card. Best result last. */
export const RESULT_LABEL: Record<ResultKind, string> = {
  participated: "Participated",
  advanced: "Advanced to a later round",
  finalist: "Finalist",
  third: "3rd place",
  second: "2nd place",
  first: "1st place",
};
export const RESULT_ORDER: ResultKind[] = [
  "participated",
  "advanced",
  "finalist",
  "third",
  "second",
  "first",
];

/** Short label for stat lines and résumé lists: "1st", "Finalist". */
export const RESULT_SHORT: Record<ResultKind, string> = {
  participated: "Participant",
  advanced: "Advanced",
  finalist: "Finalist",
  third: "3rd place",
  second: "2nd place",
  first: "1st place",
};

export type ClientResult<T> =
  { ok: true; data: T } | { ok: false; message: string; status: number };

async function call<T>(url: string, init?: RequestInit): Promise<ClientResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return {
      ok: false,
      status: 0,
      message: "We could not reach Comet Arena. Check your connection and try again.",
    };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: body as T };
  if (res.status === 401)
    return { ok: false, status: 401, message: "Sign in with your @utdallas.edu account first." };
  return {
    ok: false,
    status: res.status,
    message:
      typeof body.message === "string" ? body.message : "Something went wrong. Please try again.",
  };
}

export const fetchEntries = async (): Promise<EntryRow[]> => {
  const res = await fetch("/api/me/entries", { cache: "no-store" });
  if (!res.ok) throw new Error(`entries ${res.status}`);
  return ((await res.json()) as { entries: EntryRow[] }).entries;
};

export const saveEntry = (v: {
  competition_id: string;
  result: ResultKind;
  rounds_advanced: number;
  team_name: string;
}) =>
  call<EntryRow>("/api/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(v),
  });

export const removeEntry = (id: string) =>
  call<{ deleted: true }>(`/api/entries/${id}`, { method: "DELETE" });
