\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'creator@utdallas.edu'),
  ('00000000-0000-4000-8000-0000000000a2', 's2@utdallas.edu'),
  ('00000000-0000-4000-8000-0000000000a3', 's3@utdallas.edu'),
  ('00000000-0000-4000-8000-0000000000a4', 's4@utdallas.edu');
insert into public.competitions (id, title, status, created_by) values
  ('70000000-0000-4000-8000-000000000001', 'Unverified one', 'unverified', '00000000-0000-4000-8000-0000000000a1'),
  ('70000000-0000-4000-8000-000000000002', 'Past one', 'past', null);

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false); end $$;

set role authenticated;
do $$
declare r record;
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
  select * into r from public.confirm_competition('70000000-0000-4000-8000-000000000001');
  if r.confirmations <> 1 or r.status <> 'unverified' or r.already then raise exception 'first confirm: %', r; end if;
  -- same student again: no change
  select * into r from public.confirm_competition('70000000-0000-4000-8000-000000000001');
  if r.confirmations <> 1 or not r.already then raise exception 'duplicate confirm must be a no-op: %', r; end if;

  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
  select * into r from public.confirm_competition('70000000-0000-4000-8000-000000000001');
  if r.confirmations <> 2 or r.status <> 'unverified' then raise exception 'second confirm: %', r; end if;

  -- the submitter cannot confirm their own listing
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
  begin perform public.confirm_competition('70000000-0000-4000-8000-000000000001'); raise exception 'creator confirmed own listing';
  exception when insufficient_privilege then null; end;

  -- third distinct student flips it to live
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000a4');
  select * into r from public.confirm_competition('70000000-0000-4000-8000-000000000001');
  if r.confirmations <> 3 or r.status <> 'live' then raise exception 'third confirm should make it live: %', r; end if;

  -- closed and missing competitions are refused
  begin perform public.confirm_competition('70000000-0000-4000-8000-000000000002'); raise exception 'confirmed a past competition';
  exception when invalid_parameter_value then null; end;
  begin perform public.confirm_competition('70000000-0000-4000-8000-0000000000ff'); raise exception 'confirmed a missing competition';
  exception when no_data_found then null; end;
end $$;

-- visitors cannot confirm; counters cannot be edited directly
reset role;
set role anon;
do $$ begin begin perform public.confirm_competition('70000000-0000-4000-8000-000000000001'); raise exception 'anon confirmed';
  exception when insufficient_privilege then null; end; end $$;
reset role;
set role authenticated;
do $$ begin begin update public.competitions set confirmations = 99 where id = '70000000-0000-4000-8000-000000000002'; 
  if found then raise exception 'student edited a counter'; end if;
  exception when insufficient_privilege then null; end; end $$;

-- flags: allowed fields only, one open per student+field, own rows visible, admin triage
do $$
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
  insert into public.flags (competition_id, user_id, field, note) values ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 'dates', 'wrong date');
  begin insert into public.flags (competition_id, user_id, field, note) values ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 'dates', 'again');
    raise exception 'duplicate open flag allowed'; exception when unique_violation then null; end;
  begin insert into public.flags (competition_id, user_id, field, note) values ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 'bogus', '');
    raise exception 'unknown field allowed'; exception when check_violation then null; end;
  begin insert into public.flags (competition_id, user_id, field, note) values ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 'other', repeat('x', 501));
    raise exception 'oversized note allowed'; exception when check_violation then null; end;
  begin insert into public.flags (competition_id, user_id, field, note) values ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a3', 'other', 'as someone else');
    raise exception 'flag as another user allowed'; exception when insufficient_privilege then null; end;
  if (select count(*) from public.flags) <> 1 then raise exception 'student should see only their own flag'; end if;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
  if (select count(*) from public.flags) <> 0 then raise exception 'student saw someone else''s flag'; end if;
end $$;
reset role;
truncate public.flags, public.competition_confirmations, public.competitions cascade;
delete from auth.users;
