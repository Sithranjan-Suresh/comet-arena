-- Task 50: edge cases from product_spec §4 (service role only).

-- Apply new stage dates from a repost WITHOUT breaking saves or warnings:
-- stages are matched by name and updated in place (ids survive, so warnings_sent keeps its idempotency),
-- new names are inserted, names that disappeared are removed. Records the change for savers (Task 71).
-- Returns true when anything changed.
create or replace function public.apply_stage_update(p_id uuid, p_stages jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
  changed boolean := false;
  before jsonb;
  after jsonb;
  n int;
  had_stages boolean;
begin
  if p_stages is null or jsonb_array_length(p_stages) = 0 then return false; end if;

  select exists (select 1 from public.stages where competition_id = p_id) into had_stages;
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'starts_at', starts_at, 'deadline_at', deadline_at) order by deadline_at), '[]'::jsonb)
    into before from public.stages where competition_id = p_id;

  for s in select * from jsonb_array_elements(p_stages) loop
    update public.stages set
      starts_at = nullif(s ->> 'starts_at', '')::timestamptz,
      deadline_at = (s ->> 'deadline_at')::timestamptz
    where competition_id = p_id and lower(name) = lower(s ->> 'name')
      and (starts_at is distinct from nullif(s ->> 'starts_at', '')::timestamptz
           or deadline_at <> (s ->> 'deadline_at')::timestamptz);
    get diagnostics n = row_count;
    if n > 0 then changed := true; end if;

    if not exists (select 1 from public.stages where competition_id = p_id and lower(name) = lower(s ->> 'name')) then
      insert into public.stages (competition_id, name, starts_at, deadline_at, "order")
      values (p_id, s ->> 'name', nullif(s ->> 'starts_at', '')::timestamptz, (s ->> 'deadline_at')::timestamptz, 0);
      changed := true;
    end if;
  end loop;

  delete from public.stages
  where competition_id = p_id
    and lower(name) not in (select lower(x ->> 'name') from jsonb_array_elements(p_stages) x);
  get diagnostics n = row_count;
  if n > 0 then changed := true; end if;

  update public.stages st set "order" = r.rn
  from (select id, (row_number() over (order by deadline_at))::int as rn from public.stages where competition_id = p_id) r
  where st.id = r.id and st."order" <> r.rn;

  if changed then
    select coalesce(jsonb_agg(jsonb_build_object('name', name, 'starts_at', starts_at, 'deadline_at', deadline_at) order by deadline_at), '[]'::jsonb)
      into after from public.stages where competition_id = p_id;
    -- Only notify savers about changes to dates they already had, not the first time dates appear.
    if had_stages then
      insert into public.competition_changes (competition_id, summary)
      values (p_id, jsonb_build_object('before', before, 'after', after));
    end if;
    -- An announced-but-undated ("expected") competition now has dates.
    update public.competitions set status = 'unverified' where id = p_id and status = 'expected';
    update public.competitions set updated_at = clock_timestamp() where id = p_id;
  end if;
  return changed;
end $$;

-- Recap posts ("Congrats to the winners!") attach to an existing listing by title. High threshold on
-- purpose so "Spring" and "Fall" editions of the same event are never confused.
create or replace function public.match_competition_by_title(p_title text, p_min real default 0.75)
returns table (id uuid, slug text, title text, similarity real)
language sql stable set search_path = public, extensions as $$
  select c.id, c.slug, c.title, extensions.similarity(lower(c.title), lower(p_title))::real as similarity
  from public.competitions c
  where c.status <> 'rejected'
    and extensions.similarity(lower(c.title), lower(p_title)) >= p_min
  order by similarity desc, c.updated_at desc
  limit 3
$$;

-- Dedupe candidates now also return the host so "same title + same host, dates moved" can be
-- recognised as the same event even when the date in the embedding text pushes similarity below 0.92.
drop function if exists public.match_competitions(extensions.vector, timestamptz, integer, real, integer);
create function public.match_competitions(
  p_embedding extensions.vector(768),
  p_around timestamptz,
  p_window_days integer default 45,
  p_min_similarity real default 0.8,
  p_limit integer default 5
) returns table (id uuid, slug text, title text, host_name text, similarity real)
language sql stable set search_path = public, extensions as $$
  select c.id, c.slug, c.title, c.host_name, (1 - (c.embedding <=> p_embedding))::real as similarity
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
revoke all on function public.match_competitions(extensions.vector, timestamptz, integer, real, integer)
  from public, anon, authenticated;
grant execute on function public.match_competitions(extensions.vector, timestamptz, integer, real, integer)
  to service_role;

revoke all on function public.apply_stage_update(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.match_competition_by_title(text, real) from public, anon, authenticated;
grant execute on function public.apply_stage_update(uuid, jsonb) to service_role;
grant execute on function public.match_competition_by_title(text, real) to service_role;
