-- Task 123: past winners on Game Day (names only for students who opt in) and prep resources per competition.

alter table public.users add column public_results boolean not null default false;
comment on column public.users.public_results is 'Show first name + last initial on past-winners lists. Off by default.';
grant update (public_results) on public.users to authenticated;

create table public.competition_resources (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  url text not null check (url ~* '^https?://' and char_length(url) <= 500),
  created_at timestamptz not null default now()
);
create index competition_resources_comp_idx on public.competition_resources (competition_id, created_at);
alter table public.competition_resources enable row level security;
grant select on public.competition_resources to anon, authenticated;
create policy resources_public_read on public.competition_resources for select to anon, authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_id and c.status <> 'rejected'));

create or replace function public.officer_add_resource(p_id uuid, p_label text, p_url text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int;
begin
  if not public.is_officer_of_competition(p_id) then raise exception 'not an officer of this competition' using errcode = '42501'; end if;
  select count(*) into n from public.competition_resources where competition_id = p_id;
  if n >= 20 then raise exception 'too many resources' using errcode = '22023'; end if;
  insert into public.competition_resources (competition_id, label, url) values (p_id, btrim(p_label), btrim(p_url)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.officer_remove_resource(p_resource uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_comp uuid;
begin
  select competition_id into v_comp from public.competition_resources where id = p_resource;
  if v_comp is null then return false; end if;
  if not public.is_officer_of_competition(v_comp) then raise exception 'not an officer of this competition' using errcode = '42501'; end if;
  delete from public.competition_resources where id = p_resource;
  return true;
end $$;
revoke all on function public.officer_add_resource(uuid, text, text), public.officer_remove_resource(uuid) from public, anon;
grant execute on function public.officer_add_resource(uuid, text, text), public.officer_remove_resource(uuid) to authenticated;

-- Podium results (host-verified only). The student's name appears only if they opted in; otherwise `display` is null.
create or replace function public.past_winners(p_competition_id uuid)
returns table (place text, team_name text, display text, season text)
language sql stable security definer set search_path = public as $$
  select e.result::text, nullif(e.team_name, ''),
         case when u.public_results and nullif(btrim(u.name), '') is not null
              then split_part(btrim(u.name), ' ', 1) ||
                   case when position(' ' in btrim(u.name)) > 0 then ' ' || left(regexp_replace(btrim(u.name), '^.*\s', ''), 1) || '.' else '' end
              end,
         e.season
  from public.entries e join public.users u on u.id = e.user_id
  join public.competitions c on c.id = e.competition_id and c.status <> 'rejected'
  where e.competition_id = p_competition_id and e.verified_by_host and e.result in ('first', 'second', 'third')
  order by case e.result when 'first' then 1 when 'second' then 2 else 3 end, e.team_name, u.name
$$;
revoke all on function public.past_winners(uuid) from public;
grant execute on function public.past_winners(uuid) to anon, authenticated, service_role;
