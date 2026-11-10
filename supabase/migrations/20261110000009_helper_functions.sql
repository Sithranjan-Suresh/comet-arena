-- Task 17: SQL helpers used by the API and jobs.

-- Next upcoming stage of a competition (or null when every stage has passed).
create or replace function public.competition_next_deadline(p_competition_id uuid)
returns timestamptz language sql stable as $$
  select min(deadline_at) from public.stages
  where competition_id = p_competition_id and deadline_at >= now()
$$;

-- Card feed: one row per visible competition with its next stage. RLS of the caller applies.
-- `next_*` falls back to the last stage when everything has passed so past cards still show a date.
create view public.competition_cards with (security_invoker = true) as
select
  c.id, c.slug, c.title, c.host_org_id, c.host_name, o.slug as host_slug, c.categories, c.prize,
  c.status, c.tier, c.cost, c.format, c.utd_only, c.beginner_friendly, c.updated_at,
  c.search_tsv,
  s.id as next_stage_id, s.name as next_stage_name, s.starts_at as next_stage_starts_at,
  s.deadline_at as next_stage_deadline_at, s."order" as next_stage_order,
  (s.deadline_at >= now()) as has_upcoming
from public.competitions c
left join public.orgs o on o.id = c.host_org_id
left join lateral (
  select st.* from public.stages st
  where st.competition_id = c.id
  order by (st.deadline_at >= now()) desc,
           case when st.deadline_at >= now() then st.deadline_at end asc,
           st.deadline_at desc
  limit 1
) s on true;
grant select on public.competition_cards to anon, authenticated;

-- Dedupe lookup (spec §5): similar competitions with any stage within ±window of a date.
create or replace function public.match_competitions(
  p_embedding extensions.vector(768),
  p_around timestamptz,
  p_window_days integer default 45,
  p_min_similarity real default 0.8,
  p_limit integer default 5
) returns table (id uuid, slug text, title text, similarity real)
language sql stable set search_path = public, extensions as $$
  select c.id, c.slug, c.title, (1 - (c.embedding <=> p_embedding))::real as similarity
  from public.competitions c
  where c.embedding is not null
    and c.status <> 'rejected'
    and exists (
      select 1 from public.stages s
      where s.competition_id = c.id
        and s.deadline_at between p_around - make_interval(days => p_window_days)
                              and p_around + make_interval(days => p_window_days))
    and (1 - (c.embedding <=> p_embedding)) >= p_min_similarity
  order by c.embedding <=> p_embedding
  limit p_limit
$$;

-- Warning candidates: stages with a deadline in [p_from, p_to], on saved, non-rejected competitions,
-- joined to savers who have warnings on. The job subtracts warnings_sent itself.
create or replace function public.stages_due_between(p_from timestamptz, p_to timestamptz)
returns table (
  stage_id uuid, stage_name text, deadline_at timestamptz, competition_id uuid, title text,
  slug text, register_url text, user_id uuid, email text, user_name text
) language sql stable as $$
  select s.id, s.name, s.deadline_at, c.id, c.title, c.slug, c.register_url, u.id, u.email, u.name
  from public.stages s
  join public.competitions c on c.id = s.competition_id and c.status in ('live', 'unverified')
  join public.saves sv on sv.competition_id = c.id
  join public.users u on u.id = sv.user_id and u.email_warnings
  where s.deadline_at between p_from and p_to
$$;

revoke all on function public.match_competitions(extensions.vector, timestamptz, integer, real, integer)
  from public, anon, authenticated;
revoke all on function public.stages_due_between(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.match_competitions(extensions.vector, timestamptz, integer, real, integer)
  to service_role;
grant execute on function public.stages_due_between(timestamptz, timestamptz) to service_role;
