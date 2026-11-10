import type { BoardFreeAgent, BoardOpening } from "@/lib/board";

export interface RoleFit {
  /** Roles the opening needs that the agent can play. */
  overlap: string[];
  /** Roles the opening needs that the agent cannot cover. */
  missing: string[];
  /** Share of the opening's needed roles this person covers, 0 to 1. */
  score: number;
}

/** How well `offered` roles cover what a team `needs`. An opening that needs nothing matches no one. */
export function roleFit(offered: string[], needed: string[]): RoleFit {
  const have = new Set(offered);
  const need = [...new Set(needed)];
  const overlap = need.filter((r) => have.has(r));
  return {
    overlap,
    missing: need.filter((r) => !have.has(r)),
    score: need.length ? overlap.length / need.length : 0,
  };
}

export interface OpeningSuggestion extends RoleFit {
  opening: BoardOpening;
}
export interface AgentSuggestion extends RoleFit {
  agent: BoardFreeAgent;
}

const byFit = (a: { score: number; overlap: string[]; created: string; id: string }, b: typeof a) =>
  b.score - a.score ||
  b.overlap.length - a.overlap.length ||
  b.created.localeCompare(a.created) ||
  a.id.localeCompare(b.id);

/**
 * Openings that could use someone offering `myRoles`, best fit first: the more of a team's needs you cover,
 * the higher it ranks; ties go to the newer post. Your own openings and teams you cannot help are left out.
 */
export function suggestOpenings(
  myRoles: string[],
  openings: BoardOpening[],
  limit = 5,
): OpeningSuggestion[] {
  return openings
    .filter((o) => !o.is_mine)
    .map((opening) => ({ opening, ...roleFit(myRoles, opening.roles_needed) }))
    .filter((s) => s.overlap.length > 0)
    .sort((a, b) =>
      byFit(
        { ...a, created: a.opening.created_at, id: a.opening.id },
        { ...b, created: b.opening.created_at, id: b.opening.id },
      ),
    )
    .slice(0, limit);
}

/** Free agents who could fill a team's open roles, best fit first. Your own post is left out. */
export function suggestAgents(
  rolesNeeded: string[],
  agents: BoardFreeAgent[],
  limit = 5,
): AgentSuggestion[] {
  return agents
    .filter((a) => !a.is_mine)
    .map((agent) => ({ agent, ...roleFit(agent.roles, rolesNeeded) }))
    .filter((s) => s.overlap.length > 0)
    .sort((a, b) =>
      byFit(
        { ...a, created: a.agent.created_at, id: a.agent.id },
        { ...b, created: b.agent.created_at, id: b.agent.id },
      ),
    )
    .slice(0, limit);
}
