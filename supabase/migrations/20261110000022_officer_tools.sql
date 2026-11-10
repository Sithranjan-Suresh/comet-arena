-- Task 117: an approved officer edits their organization's listings and uploads results.
-- All three entry points are security definer and verify ownership themselves (orgs.claimed_by = caller).

create or replace function public.is_officer_of_competition(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.competitions c join public.orgs o on o.id = c.host_org_id
    where c.id = p_id and o.claimed_by = auth.uid() and auth.uid() is not null
  )
$$;
revoke all on function public.is_officer_of_competition(uuid) from public, anon;
grant execute on function public.is_officer_of_competition(uuid) to authenticated;

-- Edit text fields. Claimed listings are verified: unverified/expected ones become live.
create or replace function public.officer_update_competition(p_id uuid, p_patch jsonb)
returns public.competition_status language plpgsql security definer set search_path = public as $$
declare v_status public.competition_status;
begin
  if not public.is_officer_of_competition(p_id) then raise exception 'not an officer of this competition' using errcode = '42501'; end if;
  -- Defense in depth: the API validates too, but this function is callable directly.
  if nullif(btrim(p_patch ->> 'register_url'), '') is not null and (p_patch ->> 'register_url') !~* '^https?://' then
    raise exception 'registration link must be http or https' using errcode = '22023';
  end if;
  update public.competitions c set
    title = coalesce(nullif(btrim(p_patch ->> 'title'), ''), c.title),
    description = case when p_patch ? 'description' then nullif(btrim(p_patch ->> 'description'), '') else c.description end,
    prize = case when p_patch ? 'prize' then nullif(btrim(p_patch ->> 'prize'), '') else c.prize end,
    location = case when p_patch ? 'location' then nullif(btrim(p_patch ->> 'location'), '') else c.location end,
    register_url = case when p_patch ? 'register_url' then nullif(btrim(p_patch ->> 'register_url'), '') else c.register_url end,
    cost = case when p_patch ? 'cost' then (p_patch ->> 'cost')::public.competition_cost else c.cost end,
    format = case when p_patch ? 'format' then (p_patch ->> 'format')::public.competition_format else c.format end,
    categories = case when p_patch ? 'categories' then coalesce(array(select jsonb_array_elements_text(p_patch -> 'categories')), '{}') else c.categories end,
    status = case when c.status in ('unverified', 'expected') then 'live'::public.competition_status else c.status end
  where c.id = p_id
  returning c.status into v_status;
  return v_status;
end $$;

-- Change dates. Goes through apply_stage_update so people who saved the competition are told.
create or replace function public.officer_set_stages(p_id uuid, p_stages jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare changed boolean;
begin
  if not public.is_officer_of_competition(p_id) then raise exception 'not an officer of this competition' using errcode = '42501'; end if;
  changed := public.apply_stage_update(p_id, p_stages);
  update public.competitions set status = 'live' where id = p_id and status in ('unverified', 'expected');
  return changed;
end $$;

-- Results: [{email, result, rounds_advanced?, points?, team_name?}]. Matched students get a host-verified entry.
-- Returns only counts (never which addresses have accounts).
create or replace function public.officer_upload_results(p_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_user uuid; matched int := 0; unmatched int := 0; v_season text; last_dl timestamptz;
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
    insert into public.entries (user_id, competition_id, team_name, result, rounds_advanced, points, verified_by_host, season)
    values (v_user, p_id, coalesce(r ->> 'team_name', ''), (r ->> 'result')::public.entry_result,
            coalesce((r ->> 'rounds_advanced')::int, 0), nullif(r ->> 'points', '')::int, true, v_season)
    on conflict (user_id, competition_id) do update set
      result = excluded.result, rounds_advanced = excluded.rounds_advanced, points = excluded.points,
      team_name = case when excluded.team_name <> '' then excluded.team_name else public.entries.team_name end,
      verified_by_host = true, season = excluded.season;
    matched := matched + 1;
  end loop;
  return jsonb_build_object('matched', matched, 'unmatched', unmatched);
end $$;

revoke all on function public.officer_update_competition(uuid, jsonb), public.officer_set_stages(uuid, jsonb),
  public.officer_upload_results(uuid, jsonb) from public, anon;
grant execute on function public.officer_update_competition(uuid, jsonb), public.officer_set_stages(uuid, jsonb),
  public.officer_upload_results(uuid, jsonb) to authenticated;
