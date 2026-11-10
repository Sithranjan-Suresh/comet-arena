-- Task 11: user-scoped tables (spec §3).

create table public.saves (
  user_id uuid not null references public.users (id) on delete cascade,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, competition_id)
);

-- Idempotency ledger: one warning per user + stage + window, ever.
create table public.warnings_sent (
  user_id uuid not null references public.users (id) on delete cascade,
  stage_id uuid not null references public.stages (id) on delete cascade,
  "window" public.warning_window not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, stage_id, "window")
);

create table public.free_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  roles text[] not null default '{}' check (cardinality(roles) >= 1),
  note text not null default '' check (char_length(note) <= 280),
  status public.post_status not null default 'open',
  created_at timestamptz not null default now(),
  unique (user_id, competition_id)
);

create table public.team_openings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  team_name text not null check (char_length(team_name) between 1 and 80),
  roles_needed text[] not null default '{}' check (cardinality(roles_needed) >= 1),
  note text not null default '' check (char_length(note) <= 280),
  status public.post_status not null default 'open',
  created_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  team_name text not null default '',
  result public.entry_result not null default 'participated',
  rounds_advanced integer not null default 0 check (rounds_advanced >= 0),
  verified_by_host boolean not null default false,
  points integer,
  season text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, competition_id)
);

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  field text not null,
  note text not null default '',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Non-account digest list (Comet Arena Weekly). `confirmed_at` supports double opt-in.
create table public.email_subscribers (
  email text primary key,
  source text not null default 'web',
  confirm_token text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
