"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRequireAuth } from "@/components/auth/useRequireAuth";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  RoleChip,
  Skeleton,
  Textarea,
  ToggleChip,
  useToast,
  Input,
} from "@/components/ui";
import type { BoardFreeAgent, BoardOpening } from "@/lib/board";
import { SuggestedMatches } from "./SuggestedMatches";
import {
  closeFreeAgent,
  closeOpening,
  contactHref,
  fetchBoard,
  postFreeAgent,
  postOpening,
} from "@/lib/free-agency-client";
import { roleLabel } from "@/lib/labels";
import { ROLES, type Role } from "@/lib/schemas";

type Tab = "agents" | "openings";
const NOTE_MAX = 280;

function RoleFilter({
  value,
  onChange,
}: {
  value: Role | null;
  onChange: (r: Role | null) => void;
}) {
  return (
    <div role="group" aria-label="Filter by role" className="flex flex-wrap gap-2">
      <ToggleChip selected={value === null} onChange={() => onChange(null)}>
        All roles
      </ToggleChip>
      {ROLES.map((r) => (
        <ToggleChip key={r} selected={value === r} onChange={(on) => onChange(on ? r : null)}>
          {roleLabel(r)}
        </ToggleChip>
      ))}
    </div>
  );
}

function Contact({ email, title }: { email: string | null; title: string }) {
  const [shown, setShown] = useState(false);
  if (!email) return null;
  if (!shown)
    return (
      <Button size="sm" variant="secondary" onClick={() => setShown(true)}>
        Contact
      </Button>
    );
  return (
    <a href={contactHref(email, title)} className="font-semibold underline">
      {email}
    </a>
  );
}

function PostForm({
  kind,
  initialRoles = [],
  onSubmit,
  onCancel,
  busy,
  error,
}: {
  kind: Tab;
  initialRoles?: Role[];
  onSubmit: (v: { roles: Role[]; note: string; team: string }) => void;
  onCancel: () => void;
  busy: boolean;
  error?: string;
}) {
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [note, setNote] = useState("");
  const [team, setTeam] = useState("");
  const [problem, setProblem] = useState<string>();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === "openings" && !team.trim()) return setProblem("Name your team.");
    if (roles.length === 0)
      return setProblem(
        kind === "agents"
          ? "Pick at least one role you can play."
          : "Pick at least one role you need.",
      );
    setProblem(undefined);
    onSubmit({ roles, note: note.trim(), team: team.trim() });
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {kind === "openings" && (
        <Input
          label="Team name"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          maxLength={80}
        />
      )}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">
          {kind === "agents" ? "Roles you can play" : "Roles you need"}
        </legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <ToggleChip
              key={r}
              selected={roles.includes(r)}
              onChange={(on) => setRoles(on ? [...roles, r] : roles.filter((x) => x !== r))}
            >
              {roleLabel(r)}
            </ToggleChip>
          ))}
        </div>
      </fieldset>
      <Textarea
        label="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={NOTE_MAX}
        hint={`${note.length}/${NOTE_MAX}. What you are good at, or what the team is building.`}
      />
      {(problem || error) && (
        <p role="alert" className="text-critical text-sm font-medium">
          {problem ?? error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" loading={busy}>
          Post
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Free Agency for one competition: students without a team post themselves, teams post the roles they need,
 * and either side can reach out (signed-in students only see contact emails).
 */
export function FreeAgencyBoard({
  slug,
  competitionId,
  title,
  registrationClosed,
}: {
  slug: string;
  competitionId: string;
  title: string;
  registrationClosed: boolean;
}) {
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("agents");
  const [role, setRole] = useState<Role | null>(null);
  const [dialog, setDialog] = useState<Tab | null>(null);
  const [formError, setFormError] = useState<string>();

  const board = useQuery({
    queryKey: ["board", slug, role, !!user],
    queryFn: () => fetchBoard(slug, role),
  });
  // Suggestions need the whole board even while a role filter narrows the lists below (same key as the
  // unfiltered view, so with no filter this is the same cached query).
  const full = useQuery({
    queryKey: ["board", slug, null, !!user],
    queryFn: () => fetchBoard(slug, null),
    enabled: !!user && role !== null,
  });
  const matchesBoard = role === null ? board.data : full.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["board", slug] });

  const post = useMutation({
    mutationFn: async (v: { kind: Tab; roles: Role[]; note: string; team: string }) =>
      v.kind === "agents"
        ? postFreeAgent(competitionId, v.roles, v.note)
        : postOpening(competitionId, v.team, v.roles, v.note),
    onSuccess: (r) => {
      if (!r.ok) return setFormError(r.message);
      setDialog(null);
      setFormError(undefined);
      toast.show("Posted.", "success");
      void refresh();
    },
  });
  const close = useMutation({
    mutationFn: (v: { kind: Tab; id: string }) =>
      v.kind === "agents" ? closeFreeAgent(v.id) : closeOpening(v.id),
    onSuccess: (r) =>
      r.ok ? (toast.show("Closed.", "success"), void refresh()) : toast.show(r.message, "error"),
  });

  function open(kind: Tab) {
    if (!requireAuth()) return;
    setFormError(undefined);
    setDialog(kind);
  }

  const agents = board.data?.free_agents ?? [];
  const openings = board.data?.openings ?? [];

  return (
    <section aria-labelledby="board" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="board" className="text-2xl font-bold">
            Find a team
          </h2>
          <p className="text-ink-muted text-sm">
            Free agents and teams looking for teammates for this competition.
          </p>
        </div>
        {registrationClosed ? (
          <p className="text-ink-muted text-sm font-semibold">
            Registration has closed, so posting is closed too.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => open("agents")}>I need a team</Button>
            <Button variant="secondary" onClick={() => open("openings")}>
              My team needs people
            </Button>
          </div>
        )}
      </div>

      {user && matchesBoard && <SuggestedMatches board={matchesBoard} title={title} />}

      <div role="tablist" aria-label="Board" className="flex gap-2">
        {(
          [
            ["agents", `Free agents (${agents.length})`],
            ["openings", `Team openings (${openings.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-11 rounded-lg px-4 font-semibold ${tab === k ? "bg-turf text-chalk" : "bg-chalk text-ink ring-court-dark ring-1"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <RoleFilter value={role} onChange={setRole} />

      {board.isLoading ? (
        <div role="status" aria-label="Loading the board">
          <Skeleton className="h-20 w-full" />
          <span className="sr-only">Loading…</span>
        </div>
      ) : board.isError ? (
        <ErrorState message="We could not load the board." onRetry={() => void board.refetch()} />
      ) : tab === "agents" ? (
        agents.length === 0 ? (
          <EmptyState
            title="No free agents yet"
            description={
              role
                ? "No one is offering that role. Try All roles."
                : "Be the first: post the roles you can play."
            }
          />
        ) : (
          <ul className="space-y-3">
            {agents.map((a) => (
              <AgentCard
                key={a.id}
                a={a}
                title={title}
                onClose={() => close.mutate({ kind: "agents", id: a.id })}
              />
            ))}
          </ul>
        )
      ) : openings.length === 0 ? (
        <EmptyState
          title="No team openings yet"
          description={
            role
              ? "No team needs that role. Try All roles."
              : "Have a team that needs another member? Post the roles you need."
          }
        />
      ) : (
        <ul className="space-y-3">
          {openings.map((o) => (
            <OpeningCard
              key={o.id}
              o={o}
              title={title}
              onClose={() => close.mutate({ kind: "openings", id: o.id })}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "openings" ? "Post a team opening" : "Post as a free agent"}
      >
        {dialog && (
          <PostForm
            key={dialog}
            kind={dialog}
            busy={post.isPending}
            error={formError}
            onCancel={() => setDialog(null)}
            onSubmit={(v) => post.mutate({ kind: dialog, ...v })}
          />
        )}
      </Dialog>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <li className="bg-chalk ring-court-dark space-y-2 rounded-lg p-4 ring-1">{children}</li>;
}

function AgentCard({
  a,
  title,
  onClose,
}: {
  a: BoardFreeAgent;
  title: string;
  onClose: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {a.display_name}
          {a.is_mine && <span className="text-ink-muted font-normal"> (you)</span>}
        </p>
        {a.is_mine ? (
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close my post
          </Button>
        ) : (
          <Contact email={a.contact_email} title={title} />
        )}
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Roles">
        {a.roles.map((r) => (
          <li key={r}>
            <RoleChip role={r} />
          </li>
        ))}
      </ul>
      {a.note && <p className="text-sm">{a.note}</p>}
      {!a.is_mine && !a.contact_email && (
        <p className="text-ink-muted text-xs">Sign in to see how to reach them.</p>
      )}
    </Card>
  );
}

function OpeningCard({
  o,
  title,
  onClose,
}: {
  o: BoardOpening;
  title: string;
  onClose: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {o.team_name}{" "}
          <span className="text-ink-muted font-normal">
            · posted by {o.display_name}
            {o.is_mine ? " (you)" : ""}
          </span>
        </p>
        {o.is_mine ? (
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close this opening
          </Button>
        ) : (
          <Contact email={o.contact_email} title={title} />
        )}
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Roles needed">
        {o.roles_needed.map((r) => (
          <li key={r}>
            <RoleChip role={r} />
          </li>
        ))}
      </ul>
      {o.note && <p className="text-sm">{o.note}</p>}
      {!o.is_mine && !o.contact_email && (
        <p className="text-ink-muted text-xs">Sign in to see how to reach them.</p>
      )}
    </Card>
  );
}
