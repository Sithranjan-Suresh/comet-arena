-- Task 10: orgs, users, competitions, competition_sources, stages, eligibility (spec §3).

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  major text,
  class_year text,
  courses text[] not null default '{}',
  interests text[] not null default '{}',
  roles text[] not null default '{}',
  email_warnings boolean not null default true,
  digest boolean not null default true,
  -- Random secret that authenticates the personal .ics feed URL.
  ics_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  reputation integer not null default 0,
  is_admin boolean not null default false,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  utdclubs_slug text,
  campusgroups_id text,
  ig_handle text,
  ig_account_type public.ig_account_type not null default 'unknown',
  discord_url text,
  tags text[] not null default '{}',
  verified boolean not null default false,
  claimed_by uuid references public.users (id) on delete set null,
  -- True when a human entered/edited the handle; sync-orgs must never overwrite it.
  handle_manual boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  host_org_id uuid references public.orgs (id) on delete set null,
  host_name text,
  categories text[] not null default '{}',
  description text,
  tier public.competition_tier not null default 'campus',
  prize text,
  cost public.competition_cost not null default 'unknown',
  format public.competition_format not null default 'unknown',
  location text,
  nebula_room_id text,
  register_url text,
  utd_only boolean not null default true,
  beginner_friendly boolean not null default false,
  status public.competition_status not null default 'unverified',
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  confirmations integer not null default 0 check (confirmations >= 0),
  flyer_url text,
  embedding extensions.vector(768),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competition_sources (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  source public.source_type not null,
  source_url text,
  external_id text,
  seen_at timestamptz not null default now()
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  name text not null,
  starts_at timestamptz,
  deadline_at timestamptz not null,
  "order" integer not null default 0,
  check (starts_at is null or starts_at <= deadline_at)
);

create table public.eligibility (
  competition_id uuid primary key references public.competitions (id) on delete cascade,
  majors text[] not null default '{}',
  class_years text[] not null default '{}',
  course_prereqs text[] not null default '{}',
  team_min integer check (team_min is null or team_min >= 1),
  team_max integer check (team_max is null or team_max >= 1),
  cross_school boolean not null default false,
  check (team_min is null or team_max is null or team_min <= team_max)
);

comment on column public.competitions.status is 'live means host-verified or 3+ confirmations';
comment on column public.eligibility.majors is 'Empty array = open to all majors';
