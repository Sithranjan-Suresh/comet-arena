-- Task 13: indexes (spec §3) plus the join/lookup indexes the API needs.

create index stages_deadline_at_idx on public.stages (deadline_at);
create index stages_competition_id_idx on public.stages (competition_id);
create index competitions_status_idx on public.competitions (status);
create index competitions_categories_gin on public.competitions using gin (categories);
create index competitions_host_org_idx on public.competitions (host_org_id);

-- Full-text search over title + host + description (generated column keeps it in sync).
alter table public.competitions
  add column search_tsv tsvector generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(host_name, '') || ' ' || coalesce(description, ''))
  ) stored;
create index competitions_search_gin on public.competitions using gin (search_tsv);
create index competitions_title_trgm on public.competitions using gin (title extensions.gin_trgm_ops);

-- Cosine similarity for dedupe/ranking. lists=100 suits up to ~100k rows.
create index competitions_embedding_ivfflat on public.competitions
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);

create index saves_competition_id_idx on public.saves (competition_id);
create index warnings_sent_stage_idx on public.warnings_sent (stage_id);
create index free_agents_competition_idx on public.free_agents (competition_id) where status = 'open';
create index team_openings_competition_idx on public.team_openings (competition_id) where status = 'open';
create index entries_user_idx on public.entries (user_id);
create index sources_competition_idx on public.competition_sources (competition_id);
create unique index sources_external_unique on public.competition_sources (source, external_id)
  where external_id is not null;
create index ingest_posts_org_idx on public.ingest_posts (org_id);
create index review_queue_open_idx on public.review_queue (created_at) where status = 'open';
create index orgs_ig_handle_idx on public.orgs (lower(ig_handle)) where ig_handle is not null;
