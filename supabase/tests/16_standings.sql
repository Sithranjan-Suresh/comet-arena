\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000b1', 's1@utdallas.edu'), ('00000000-0000-4000-8000-0000000000b2', 's2@utdallas.edu'),
  ('00000000-0000-4000-8000-0000000000b3', 's3@utdallas.edu'), ('00000000-0000-4000-8000-0000000000b4', 's4@utdallas.edu'),
  ('00000000-0000-4000-8000-0000000000b5', 'officer@utdallas.edu');
update public.users set major = 'Accounting' where email in ('s1@utdallas.edu', 's2@utdallas.edu', 's3@utdallas.edu');
update public.users set major = 'Computer Science' where email = 's4@utdallas.edu';
insert into public.orgs (id, name, slug, claimed_by) values
  ('a0000000-0000-4000-8000-000000000001', 'AIS', 'ais', '00000000-0000-4000-8000-0000000000b5'),
  ('a0000000-0000-4000-8000-000000000002', 'ACM', 'acm', null);
insert into public.competitions (id, title, status, host_org_id, tier, categories) values
  ('b0000000-0000-4000-8000-000000000001', 'Campus Case', 'live', 'a0000000-0000-4000-8000-000000000001', 'campus', '{case_competition}'),
  ('b0000000-0000-4000-8000-000000000002', 'National Hack', 'live', 'a0000000-0000-4000-8000-000000000001', 'national', '{hackathon,case_competition}');

do $$ begin
  if public.entry_points('first', null, 'campus') <> 10 or public.entry_points('first', null, 'national') <> 20
     or public.entry_points('second', null, 'regional') <> 11 or public.entry_points('participated', null, 'campus') <> 1
     or public.entry_points('third', 42, 'national') <> 42 then raise exception 'points formula wrong'; end if;
end $$;

-- unverified entries never count
insert into public.entries (user_id, competition_id, result, season, org_id) values
  ('00000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-000000000001', 'first', 'Fall 2026', 'a0000000-0000-4000-8000-000000000002');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b5', false), set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b5","role":"authenticated"}', false);
select public.officer_upload_results('b0000000-0000-4000-8000-000000000001',
  '[{"email":"s1@utdallas.edu","result":"first","club":"AIS"},{"email":"s2@utdallas.edu","result":"second","club":"ais"},{"email":"s3@utdallas.edu","result":"participated","club":"Nope Club"}]');
select public.officer_upload_results('b0000000-0000-4000-8000-000000000002',
  '[{"email":"s1@utdallas.edu","result":"first","club":"AIS"},{"email":"s4@utdallas.edu","result":"third","club":"ACM"}]');
reset role;

do $$
declare r record;
begin
  -- the unverified entry from earlier was overwritten by the officer for s1 on Campus Case (same unique key)
  select * into r from public.standings('org', 'Fall 2026') where key = 'a0000000-0000-4000-8000-000000000001';
  if r.points <> 10 + 7 + 20 or r.wins <> 2 or r.podiums <> 3 or r.entries <> 3 or r.students <> 2 then raise exception 'AIS standing wrong: %', r; end if;
  select * into r from public.standings('org', 'Fall 2026') where key = 'a0000000-0000-4000-8000-000000000002';
  if r.points <> 10 or r.wins <> 0 then raise exception 'ACM standing wrong: %', r; end if;   -- third at a national event = 5*2
  if (select count(*) from public.standings('org', 'Fall 2026')) <> 2 then raise exception 'entries with an unknown club must not form a group'; end if;

  -- categories: a competition in two categories counts toward both
  if (select points from public.standings('category', 'Fall 2026') where key = 'case_competition') <> 10 + 7 + 1 + 20 + 10 then raise exception 'case category wrong'; end if;
  if (select points from public.standings('category', 'Fall 2026') where key = 'hackathon') <> 30 then raise exception 'hackathon category wrong'; end if;

  -- majors need 3 students: Accounting has 3 (s1,s2,s3), CS has only 1 and must be hidden
  if (select count(*) from public.standings('major', 'Fall 2026')) <> 1 then raise exception 'small major group should be hidden'; end if;
  if (select label from public.standings('major', 'Fall 2026')) <> 'Accounting' then raise exception 'wrong major group'; end if;

  -- season filter and the seasons list
  if (select count(*) from public.standings('org', 'Spring 2020')) <> 0 then raise exception 'season filter ignored'; end if;
  if (select count(*) from public.standings('org')) <> 2 then raise exception 'all-time standings wrong'; end if;
  if (select count(*) from public.standings_seasons()) <> 1 or (select season from public.standings_seasons()) <> 'Fall 2026' then raise exception 'seasons list wrong'; end if;
  begin perform public.standings('student'); raise exception 'unknown dimension accepted'; exception when invalid_parameter_value then null; end;
end $$;

-- visitors can read the aggregates but never the underlying entries
set role anon;
do $$ begin
  if (select count(*) from public.standings('org')) = 0 then raise exception 'anon cannot read standings'; end if;
  begin perform 1 from public.entries; raise exception 'anon read entries'; exception when insufficient_privilege then null; end;
end $$;
reset role;
truncate public.entries, public.competitions, public.orgs cascade; delete from auth.users;
