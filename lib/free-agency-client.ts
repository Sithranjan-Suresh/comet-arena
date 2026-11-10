import type { Board } from "@/lib/board";
import type { Role } from "@/lib/schemas";

/** Browser-side client for the Free Agency endpoints. */
export type Result<T> = { ok: true; data: T } | { ok: false; message: string; status: number };

const GENERIC = "Something went wrong. Please try again.";

async function call<T>(url: string, init?: RequestInit): Promise<Result<T>> {
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
    message: typeof body.message === "string" ? body.message : GENERIC,
  };
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const fetchBoard = async (slug: string, role?: Role | null): Promise<Board> => {
  const res = await fetch(`/api/competitions/${slug}/board${role ? `?role=${role}` : ""}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`board ${res.status}`);
  return (await res.json()) as Board;
};

export const postFreeAgent = (competition_id: string, roles: Role[], note: string) =>
  call("/api/free-agents", json("POST", { competition_id, roles, note }));
export const postOpening = (
  competition_id: string,
  team_name: string,
  roles_needed: Role[],
  note: string,
) => call("/api/team-openings", json("POST", { competition_id, team_name, roles_needed, note }));
export const closeFreeAgent = (id: string) =>
  call(`/api/free-agents/${id}`, json("PATCH", { status: "closed" }));
export const closeOpening = (id: string) =>
  call(`/api/team-openings/${id}`, json("PATCH", { status: "closed" }));
export const patchOpening = (
  id: string,
  patch: { team_name?: string; roles_needed?: Role[]; note?: string },
) => call(`/api/team-openings/${id}`, json("PATCH", patch));

/** mailto link with a helpful subject; the address itself is only ever known to signed-in viewers. */
export function contactHref(email: string, competitionTitle: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(`Teaming up for ${competitionTitle} (Comet Arena)`)}`;
}
