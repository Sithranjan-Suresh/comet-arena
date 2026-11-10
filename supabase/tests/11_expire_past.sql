\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'a@utdallas.edu');
insert into public.competitions (id, title, status) values
  ('60000000-0000-4000-8000-000000000001', 'Finished', 'live'),
  ('60000000-0000-4000-8000-000000000002', 'Reg passed, finals ahead', 'live'),
  ('60000000-0000-4000-8000-000000000003', 'All ahead', 'unverified'),
  ('60000000-0000-4000-8000-000000000004', 'Undated expected', 'expected');
insert into public.stages (competition_id, name, deadline_at, "order") values
  ('60000000-0000-4000-8000-000000000001', 'Reg', '2026-10-01', 1), ('60000000-0000-4000-8000-000000000001', 'Final', '2026-10-20', 2),
  ('60000000-0000-4000-8000-000000000002', 'Reg', '2026-11-01', 1), ('60000000-0000-4000-8000-000000000002', 'Final', '2026-12-05', 2),
  ('60000000-0000-4000-8000-000000000003', 'Reg', '2026-11-20', 1);
insert into public.free_agents (user_id, competition_id, roles) select '00000000-0000-4000-8000-0000000000a1', id, '{dev}' from public.competitions where id::text like '60000000%';
insert into public.team_openings (user_id, competition_id, team_name, roles_needed) select '00000000-0000-4000-8000-0000000000a1', id, 'T', '{dev}' from public.competitions where id::text like '60000000%';

do $$
declare r record;
begin
  select * into r from public.expire_past('2026-11-10T12:00:00Z');
  if r.competitions_expired <> 1 then raise exception 'expected 1 competition expired, got %', r.competitions_expired; end if;
  -- Finished (past) + Reg-passed are closed; All ahead + Undated stay open
  if r.free_agents_closed <> 2 or r.openings_closed <> 2 then raise exception 'closed % / %', r.free_agents_closed, r.openings_closed; end if;
  if (select status from public.competitions where title = 'Finished') <> 'past' then raise exception 'Finished should be past'; end if;
  if (select status from public.competitions where title = 'Reg passed, finals ahead') <> 'live' then raise exception 'still running, must stay live'; end if;
  if (select status from public.competitions where title = 'Undated expected') <> 'expected' then raise exception 'undated must stay expected'; end if;
  if (select count(*) from public.free_agents where status = 'open') <> 2 then raise exception 'two posts should remain open'; end if;
  -- idempotent
  select * into r from public.expire_past('2026-11-10T12:00:00Z');
  if r.competitions_expired + r.free_agents_closed + r.openings_closed <> 0 then raise exception 'second run must be a no-op'; end if;
end $$;
set role authenticated;
do $$ begin begin perform * from public.expire_past(); raise exception 'clients must not run the sweep'; exception when insufficient_privilege then null; end; end $$;
reset role;
truncate public.free_agents, public.team_openings, public.stages, public.competitions cascade;
delete from auth.users;
