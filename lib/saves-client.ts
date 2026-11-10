/** Pure helpers for the client-side saved-ids cache. */
export const SAVES_KEY = ["saves"] as const;

/** Add or remove an id without mutating the input (undefined = not loaded yet). */
export function withSaved(ids: string[] | undefined, id: string, saved: boolean): string[] {
  const set = new Set(ids ?? []);
  if (saved) set.add(id);
  else set.delete(id);
  return [...set];
}

export async function fetchSavedIds(): Promise<string[]> {
  const res = await fetch("/api/saves", { cache: "no-store" });
  if (!res.ok) throw new Error(`saves ${res.status}`);
  return ((await res.json()) as { competition_ids: string[] }).competition_ids;
}

export async function setSavedOnServer(id: string, saved: boolean): Promise<void> {
  const res = saved
    ? await fetch("/api/saves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competition_id: id }),
      })
    : await fetch(`/api/saves/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`save ${res.status}`);
}
