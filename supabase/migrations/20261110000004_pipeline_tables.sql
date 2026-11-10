-- Task 12: ingestion + moderation pipeline tables (spec §3).

-- Every Instagram post ever seen. Never reprocess a known ig_post_id.
create table public.ingest_posts (
  ig_post_id text primary key,
  org_id uuid references public.orgs (id) on delete set null,
  caption text,
  media_urls text[] not null default '{}',
  permalink text,
  posted_at timestamptz,
  seen_at timestamptz not null default now(),
  classification public.ingest_class not null,
  competition_id uuid references public.competitions (id) on delete set null
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  raw_url text,
  image_path text,
  extracted jsonb,
  status public.submission_status not null default 'pending',
  merged_into uuid references public.competitions (id) on delete set null,
  competition_id uuid references public.competitions (id) on delete set null,
  created_at timestamptz not null default now(),
  check (raw_url is not null or image_path is not null)
);

create table public.review_queue (
  id uuid primary key default gen_random_uuid(),
  kind public.queue_kind not null,
  payload jsonb not null,
  candidate_competition_id uuid references public.competitions (id) on delete set null,
  status public.queue_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Cached third-party payloads (UTD Clubs list, Nebula courses/rooms) and job cursors.
create table public.nebula_cache (
  key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

-- Records of changed dates so savers are notified exactly once (Task 71).
create table public.competition_changes (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  summary jsonb not null,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
