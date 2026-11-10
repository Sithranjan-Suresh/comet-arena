\set ON_ERROR_STOP on
-- The Field's default order: upcoming deadlines soonest first, then competitions without an upcoming deadline.
insert into public.competitions (id, title, status) values
  ('40000000-0000-4000-8000-000000000001', 'Soon', 'live'),
  ('40000000-0000-4000-8000-000000000002', 'Later', 'unverified'),
  ('40000000-0000-4000-8000-000000000003', 'Undated', 'expected'),
  ('40000000-0000-4000-8000-000000000004', 'Old', 'past'),
  ('40000000-0000-4000-8000-000000000005', 'Removed', 'rejected');
insert into public.stages (competition_id, name, deadline_at) values
  ('40000000-0000-4000-8000-000000000001', 'R', now() + interval '2 days'),
  ('40000000-0000-4000-8000-000000000002', 'R', now() + interval '9 days'),
  ('40000000-0000-4000-8000-000000000004', 'R', now() - interval '20 days'),
  ('40000000-0000-4000-8000-000000000005', 'R', now() + interval '1 day');

do $$
declare titles text[];
begin
  select array_agg(title order by has_upcoming desc nulls last, next_stage_deadline_at asc nulls last, id)
    into titles from public.competition_cards where status in ('live','unverified','expected');
  if titles <> array['Soon','Later','Undated'] then raise exception 'default order wrong: %', titles; end if;

  select array_agg(title order by has_upcoming desc nulls last, next_stage_deadline_at asc nulls last, id)
    into titles from public.competition_cards where status in ('live','unverified','expected','past');
  if titles <> array['Soon','Later','Old','Undated'] and titles <> array['Soon','Later','Undated','Old'] then
    raise exception 'with past: %', titles; end if;
  -- past/undated both have no upcoming deadline, so they come after every upcoming one
  if titles[1] <> 'Soon' or titles[2] <> 'Later' then raise exception 'upcoming must come first: %', titles; end if;
end $$;

-- the public cannot see rejected competitions through the view (security_invoker)
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  if exists (select 1 from public.competition_cards where title = 'Removed') then raise exception 'rejected leaked to anon'; end if;
  if (select count(*) from public.competition_cards) <> 4 then raise exception 'anon should see 4 cards'; end if;
end $$;
reset role;
truncate public.stages, public.competitions cascade;
