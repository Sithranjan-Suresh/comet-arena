-- Task 82: daily sweep. (service role only)
--  1. competitions whose every stage has passed become `past` (undated `expected` ones are left alone)
--  2. Free Agency posts close once a competition's registration stage (its first stage) has passed, or it is past
create or replace function public.expire_past(p_now timestamptz default now())
returns table (competitions_expired integer, free_agents_closed integer, openings_closed integer)
language plpgsql security definer set search_path = public as $$
declare ce int; fa int; op int;
begin
  update public.competitions c set status = 'past'
  where c.status in ('live', 'unverified')
    and exists (select 1 from public.stages s where s.competition_id = c.id)
    and not exists (select 1 from public.stages s where s.competition_id = c.id and s.deadline_at >= p_now);
  get diagnostics ce = row_count;

  with closed as (
    select c.id from public.competitions c
    where c.status = 'past'
       or (select s.deadline_at from public.stages s where s.competition_id = c.id order by s."order", s.deadline_at limit 1) < p_now
  )
  update public.free_agents f set status = 'closed'
  where f.status = 'open' and f.competition_id in (select id from closed);
  get diagnostics fa = row_count;

  with closed as (
    select c.id from public.competitions c
    where c.status = 'past'
       or (select s.deadline_at from public.stages s where s.competition_id = c.id order by s."order", s.deadline_at limit 1) < p_now
  )
  update public.team_openings t set status = 'closed'
  where t.status = 'open' and t.competition_id in (select id from closed);
  get diagnostics op = row_count;

  return query select ce, fa, op;
end $$;
revoke all on function public.expire_past(timestamptz) from public, anon, authenticated;
grant execute on function public.expire_past(timestamptz) to service_role;
