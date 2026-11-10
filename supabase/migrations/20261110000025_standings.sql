-- Task 122: verified points and standings. Only host-verified entries count. Aggregates only: no individual
-- is ever listed, and major groups need at least 3 students so a group cannot identify one person.

alter table public.entries add column org_id uuid references public.orgs (id) on delete set null;
create index entries_org_idx on public.entries (org_id) where verified_by_host;
comment on column public.entries.org_id is 'The club the student competed for (set by officers when uploading results)';

-- Points: result base times the competition tier, unless the host supplied an explicit score.
create or replace function public.entry_points(p_result public.entry_result, p_points integer, p_tier public.competition_tier)
returns integer language sql immutable as $$
  select coalesce(p_points, round((case p_result
      when 'first' then 10 when 'second' then 7 when 'third' then 5 when 'finalist' then 3
      when 'advanced' then 2 else 1 end) * (case p_tier when 'national' then 2.0 when 'regional' then 1.5 else 1.0 end))::int)
$$;

create or replace function public.standings(p_dimension text, p_season text default null, p_limit integer default 50)
returns table (key text, label text, points bigint, wins bigint, podiums bigint, entries bigint, students bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_dimension not in ('org', 'major', 'category') then raise exception 'unknown dimension' using errcode = '22023'; end if;
  if p_limit < 1 or p_limit > 200 then p_limit := 50; end if;

  return query
  with v as (
    select e.user_id, e.result, e.org_id, e.season,
           public.entry_points(e.result, e.points, c.tier) as pts,
           c.categories, u.major
    from public.entries e
    join public.competitions c on c.id = e.competition_id
    join public.users u on u.id = e.user_id
    where e.verified_by_host and c.status <> 'rejected'
      and (p_season is null or e.season = p_season)
  ), grouped as (
    select
      case p_dimension when 'org' then v.org_id::text when 'major' then lower(btrim(v.major)) else g.cat end as k,
      case p_dimension when 'org' then (select o.name from public.orgs o where o.id = v.org_id)
                       when 'major' then btrim(v.major) else g.cat end as l,
      v.pts, v.result, v.user_id
    from v
    left join lateral (select unnest(v.categories) as cat) g on p_dimension = 'category'
    where case p_dimension when 'org' then v.org_id is not null when 'major' then nullif(btrim(v.major), '') is not null else g.cat is not null end
  )
  select grouped.k, min(grouped.l), sum(grouped.pts)::bigint,
         count(*) filter (where grouped.result = 'first'),
         count(*) filter (where grouped.result in ('first', 'second', 'third')),
         count(*), count(distinct grouped.user_id)
  from grouped
  group by grouped.k
  having p_dimension <> 'major' or count(distinct grouped.user_id) >= 3
  order by sum(grouped.pts) desc, count(*) filter (where grouped.result = 'first') desc, min(grouped.l)
  limit p_limit;
end $$;
revoke all on function public.standings(text, text, integer) from public;
grant execute on function public.standings(text, text, integer) to anon, authenticated, service_role;

-- Seasons that have at least one verified result, newest first.
create or replace function public.standings_seasons() returns table (season text)
language sql stable security definer set search_path = public as $$
  select e.season from public.entries e where e.verified_by_host and e.season <> ''
  group by e.season
  order by max(e.created_at) desc
$$;
revoke all on function public.standings_seasons() from public;
grant execute on function public.standings_seasons() to anon, authenticated, service_role;

-- Officer uploads can now say which club each student competed for (slug or exact name; unknown clubs are ignored).
create or replace function public.officer_upload_results(p_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_user uuid; v_org uuid; matched int := 0; unmatched int := 0; v_season text; last_dl timestamptz;
begin
  if not public.is_officer_of_competition(p_id) then raise exception 'not an officer of this competition' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then raise exception 'rows must be an array of at most 1000' using errcode = '22023'; end if;

  select max(deadline_at) into last_dl from public.stages where competition_id = p_id;
  v_season := case
      when extract(month from coalesce(last_dl, now()) at time zone 'America/Chicago') between 1 and 5 then 'Spring'
      when extract(month from coalesce(last_dl, now()) at time zone 'America/Chicago') between 6 and 8 then 'Summer'
      else 'Fall' end
    || ' ' || extract(year from coalesce(last_dl, now()) at time zone 'America/Chicago')::int;

  for r in select * from jsonb_array_elements(p_rows) loop
    select id into v_user from public.users where lower(email) = lower(btrim(r ->> 'email'));
    if v_user is null then unmatched := unmatched + 1; continue; end if;
    v_org := null;
    if nullif(btrim(r ->> 'club'), '') is not null then
      select o.id into v_org from public.orgs o
      where lower(o.slug) = lower(btrim(r ->> 'club')) or lower(o.name) = lower(btrim(r ->> 'club'))
         or lower(coalesce(o.utdclubs_slug, '')) = lower(btrim(r ->> 'club'))
      limit 1;
    end if;
    insert into public.entries (user_id, competition_id, team_name, result, rounds_advanced, points, verified_by_host, season, org_id)
    values (v_user, p_id, coalesce(r ->> 'team_name', ''), (r ->> 'result')::public.entry_result,
            coalesce((r ->> 'rounds_advanced')::int, 0), nullif(r ->> 'points', '')::int, true, v_season, v_org)
    on conflict (user_id, competition_id) do update set
      result = excluded.result, rounds_advanced = excluded.rounds_advanced, points = excluded.points,
      team_name = case when excluded.team_name <> '' then excluded.team_name else public.entries.team_name end,
      org_id = coalesce(excluded.org_id, public.entries.org_id),
      verified_by_host = true, season = excluded.season;
    matched := matched + 1;
  end loop;
  return jsonb_build_object('matched', matched, 'unmatched', unmatched);
end $$;
