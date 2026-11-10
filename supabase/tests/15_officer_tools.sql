\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'officer@utdallas.edu'),
  ('00000000-0000-4000-8000-0000000000a2', 'student@utdallas.edu'),
  ('00000000-0000-4000-8000-0000000000a3', 'rando@utdallas.edu');
insert into public.orgs (id, name, slug, claimed_by, verified) values
  ('80000000-0000-4000-8000-000000000001', 'AIS', 'ais', '00000000-0000-4000-8000-0000000000a1', true),
  ('80000000-0000-4000-8000-000000000002', 'Other Club', 'other', null, false);
insert into public.competitions (id, title, status, host_org_id) values
  ('90000000-0000-4000-8000-000000000001', 'AIS Case', 'unverified', '80000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000002', 'Other Case', 'unverified', '80000000-0000-4000-8000-000000000002');
insert into public.stages (competition_id, name, deadline_at, "order") values
  ('90000000-0000-4000-8000-000000000001', 'Registration', '2026-11-20T17:00:00Z', 1),
  ('90000000-0000-4000-8000-000000000001', 'Finals', '2026-12-05T20:00:00Z', 2);
insert into public.saves (user_id, competition_id) values ('00000000-0000-4000-8000-0000000000a2', '90000000-0000-4000-8000-000000000001');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false); end $$;

set role authenticated;
do $$
declare st public.competition_status; changed boolean; res jsonb;
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
  st := public.officer_update_competition('90000000-0000-4000-8000-000000000001', '{"title":"AIS Fall Case","prize":"$1,000","description":""}');
  if st <> 'live' then raise exception 'claimed listing should become live, got %', st; end if;
  if (select title from public.competitions where id = '90000000-0000-4000-8000-000000000001') <> 'AIS Fall Case' then raise exception 'title not updated'; end if;
  if (select description from public.competitions where id = '90000000-0000-4000-8000-000000000001') is not null then raise exception 'blank description should clear it'; end if;

  changed := public.officer_set_stages('90000000-0000-4000-8000-000000000001',
    '[{"name":"Registration","deadline_at":"2026-11-22T17:00:00Z"},{"name":"Finals","deadline_at":"2026-12-05T20:00:00Z"}]');
  if not changed then raise exception 'date change not detected'; end if;

  begin perform public.officer_update_competition('90000000-0000-4000-8000-000000000001', '{"register_url":"javascript:alert(1)"}'); raise exception 'unsafe link accepted';
  exception when invalid_parameter_value then null; end;

  -- an officer cannot touch another org's listing, and a stranger cannot touch theirs
  begin perform public.officer_update_competition('90000000-0000-4000-8000-000000000002', '{"title":"hijack"}'); raise exception 'edited another org''s listing';
  exception when insufficient_privilege then null; end;
  begin perform public.officer_upload_results('90000000-0000-4000-8000-000000000002', '[]'); raise exception 'uploaded results for another org';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
  begin perform public.officer_set_stages('90000000-0000-4000-8000-000000000001', '[]'); raise exception 'stranger edited stages';
  exception when insufficient_privilege then null; end;

  -- results
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
  res := public.officer_upload_results('90000000-0000-4000-8000-000000000001',
    '[{"email":"Student@UTDallas.edu","result":"first","rounds_advanced":2,"points":10,"team_name":"Team A"},{"email":"nobody@utdallas.edu","result":"second"}]');
  if (res ->> 'matched')::int <> 1 or (res ->> 'unmatched')::int <> 1 then raise exception 'counts wrong: %', res; end if;
  -- re-upload corrects rather than duplicates
  res := public.officer_upload_results('90000000-0000-4000-8000-000000000001', '[{"email":"student@utdallas.edu","result":"second"}]');
  begin perform public.officer_upload_results('90000000-0000-4000-8000-000000000001', '[{"email":"student@utdallas.edu","result":"champion"}]'); raise exception 'invalid result accepted';
  exception when invalid_text_representation then null; end;
end $$;
reset role;
do $$
declare e record;
begin
  select * into e from public.entries where user_id = '00000000-0000-4000-8000-0000000000a2';
  if e.result <> 'second' or not e.verified_by_host or e.team_name <> 'Team A' or e.season <> 'Fall 2026' then raise exception 'entry wrong: %', e; end if;
  if (select count(*) from public.entries) <> 1 then raise exception 'duplicate entries'; end if;
  -- savers were told about the moved registration date
  if (select count(*) from public.competition_changes where competition_id = '90000000-0000-4000-8000-000000000001') <> 1 then raise exception 'date change not recorded for savers'; end if;
end $$;
-- the student cannot edit or delete a host-verified entry
set role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', false); perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', false);
  update public.entries set result = 'first' where user_id = '00000000-0000-4000-8000-0000000000a2'; if found then raise exception 'student edited a verified entry'; end if;
  delete from public.entries where user_id = '00000000-0000-4000-8000-0000000000a2'; if found then raise exception 'student deleted a verified entry'; end if;
end $$;
reset role;
truncate public.entries, public.stages, public.competition_changes, public.saves, public.competitions, public.orgs cascade; delete from auth.users;
