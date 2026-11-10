"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { Board } from "@/lib/board";
import { contactHref } from "@/lib/free-agency-client";
import { roleLabel } from "@/lib/labels";
import { suggestAgents, suggestOpenings } from "@/lib/matching";
import type { Role } from "@/lib/schemas";

const names = (roles: string[]) => roles.map((r) => roleLabel(r as Role)).join(", ");

function Contact({ email, title }: { email: string | null; title: string }) {
  const [shown, setShown] = useState(false);
  if (!email) return null;
  return shown ? (
    <a className="text-sm font-semibold underline" href={contactHref(email, title)}>
      {email}
    </a>
  ) : (
    <Button size="sm" variant="secondary" onClick={() => setShown(true)}>
      Contact
    </Button>
  );
}

/**
 * For a signed-in student with a post on this board: teams that need what they offer, and, for each of their
 * team openings, free agents who could fill it. Renders nothing when there is nothing useful to suggest.
 */
export function SuggestedMatches({ board, title }: { board: Board; title: string }) {
  const myRoles = [...new Set(board.free_agents.filter((a) => a.is_mine).flatMap((a) => a.roles))];
  const forMe = myRoles.length ? suggestOpenings(myRoles, board.openings) : [];
  const myOpenings = board.openings.filter((o) => o.is_mine);
  const forTeams = myOpenings
    .map((o) => ({ opening: o, matches: suggestAgents(o.roles_needed, board.free_agents) }))
    .filter((t) => t.matches.length > 0);
  if (forMe.length === 0 && forTeams.length === 0) return null;

  return (
    <section aria-labelledby="matches" className="bg-turf text-chalk space-y-4 rounded-xl p-4">
      <h3 id="matches" className="text-xl font-bold">
        Suggested matches
      </h3>
      {forMe.length > 0 && (
        <div className="space-y-2">
          <p className="text-chalk-muted text-sm">
            Teams that need what you offer ({names(myRoles)}):
          </p>
          <ul className="space-y-2">
            {forMe.map((s) => (
              <li
                key={s.opening.id}
                className="bg-turf-light flex flex-wrap items-center justify-between gap-2 rounded-lg p-3"
              >
                <span>
                  <strong>{s.opening.team_name}</strong> needs {names(s.opening.roles_needed)}.{" "}
                  <span className="text-chalk-muted text-sm">
                    You cover {names(s.overlap)}
                    {s.missing.length > 0 ? `; they still need ${names(s.missing)}` : ""}.
                  </span>
                </span>
                <Contact email={s.opening.contact_email} title={title} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {forTeams.map((t) => (
        <div key={t.opening.id} className="space-y-2">
          <p className="text-chalk-muted text-sm">
            Free agents who fit {t.opening.team_name} (needs {names(t.opening.roles_needed)}):
          </p>
          <ul className="space-y-2">
            {t.matches.map((s) => (
              <li
                key={s.agent.id}
                className="bg-turf-light flex flex-wrap items-center justify-between gap-2 rounded-lg p-3"
              >
                <span>
                  <strong>{s.agent.display_name}</strong> offers {names(s.agent.roles)}.{" "}
                  <span className="text-chalk-muted text-sm">
                    Covers {names(s.overlap)} of what you need.
                  </span>
                </span>
                <Contact email={s.agent.contact_email} title={title} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
