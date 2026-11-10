\set ON_ERROR_STOP on
-- Fixtures (as superuser)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'alice@utdallas.edu', '{"full_name":"Alice Comet"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'bob@utdallas.edu', '{"full_name":"Bob Comet"}'),
  ('00000000-0000-4000-8000-0000000000c3', 'admin@utdallas.edu', '{"full_name":"Admin"}');
update public.users set is_admin = true where email = 'admin@utdallas.edu';
insert into public.competitions (id, title, status) values
  ('10000000-0000-4000-8000-000000000001', 'Live Comp', 'live'),
  ('10000000-0000-4000-8000-000000000002', 'Rejected Comp', 'rejected');
insert into public.stages (competition_id, name, deadline_at) values
  ('10000000-0000-4000-8000-000000000001', 'Round 1', now() + interval '10 days'),
  ('10000000-0000-4000-8000-000000000002', 'Round 1', now() + interval '10 days');
insert into public.saves (user_id, competition_id) values
  ('00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001');
insert into public.entries (user_id, competition_id) values
  ('00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001');
insert into public.free_agents (user_id, competition_id, roles) values
  ('00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', '{dev}');
insert into public.review_queue (kind, payload) values ('low_confidence', '{}');

create schema testh;
grant usage on schema testh to public;
create or replace function testh.expect_count(q text, expected int, label text) returns void
language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || q || ') s' into n;
  if n <> expected then raise exception 'FAIL %: expected %, got %', label, expected, n; end if;
end $$;
create or replace function testh.expect_denied(q text, label text) returns void
language plpgsql as $$
begin
  begin
    execute q;
  exception when insufficient_privilege or others then
    if sqlstate in ('42501', '23514') or sqlstate = 'P0001' then return; end if;
    raise;
  end;
  raise exception 'FAIL %: statement should have been denied', label;
end $$;
grant execute on all functions in schema testh to public;

-- ===== anon =====
set role anon;
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false);
select testh.expect_count('select 1 from public.competitions', 1, 'anon sees non-rejected competitions');
select testh.expect_count('select 1 from public.stages', 1, 'anon sees only stages of visible comps');
select testh.expect_denied('select email from public.users', 'anon cannot read users');
select testh.expect_denied('select * from public.saves', 'anon cannot read saves');
select testh.expect_denied('select * from public.review_queue', 'anon cannot read review_queue');
select testh.expect_denied('select * from public.free_agents', 'anon cannot read free_agents table');
select testh.expect_denied($$insert into public.competitions (title) values ('x')$$, 'anon cannot write competitions');
-- board is public but without emails
select testh.expect_count('select 1 from public.board_free_agents', 1, 'anon sees board rows');
select testh.expect_count('select 1 from public.board_free_agents where contact_email is not null', 0, 'anon sees no contact emails');
reset role;

-- ===== alice (authenticated) =====
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false), set_config('request.jwt.claim.role', 'authenticated', false);
select testh.expect_count('select 1 from public.saves', 1, 'alice sees her save');
select testh.expect_count('select 1 from public.users', 1, 'alice sees only her own user row');
select testh.expect_count('select 1 from public.board_free_agents where contact_email is not null', 1, 'signed-in sees contact email');
select testh.expect_count('select 1 from public.review_queue', 0, 'alice sees no review_queue rows');
select testh.expect_denied($$update public.users set is_admin = true where id = auth.uid()$$, 'alice cannot self-promote');
select testh.expect_denied($$update public.entries set verified_by_host = true$$, 'alice cannot self-verify entries');
select testh.expect_denied($$insert into public.entries (user_id, competition_id, points) values (auth.uid(), '10000000-0000-4000-8000-000000000002', 50)$$, 'alice cannot grant herself points');
select testh.expect_denied($$insert into public.saves (user_id, competition_id) values ('00000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-000000000001')$$, 'alice cannot save for bob');
update public.users set major = 'CS' where id = auth.uid();  -- allowed
reset role;

-- ===== bob =====
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', false);
select testh.expect_count('select 1 from public.saves', 0, 'bob cannot see alice saves');
select testh.expect_count('select 1 from public.entries', 0, 'bob cannot see alice entries');
select testh.expect_count('select 1 from public.free_agents', 0, 'bob cannot read alice free_agents row directly');
reset role;

-- ===== admin =====
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', false);
select testh.expect_count('select 1 from public.review_queue', 1, 'admin reads review_queue');
select testh.expect_count('select 1 from public.competitions', 2, 'admin sees rejected competitions');
reset role;

-- cleanup so later test files start clean
truncate public.saves, public.entries, public.free_agents, public.review_queue, public.stages, public.competitions cascade;
delete from auth.users;
drop schema testh cascade;
