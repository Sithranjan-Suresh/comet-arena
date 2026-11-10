\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000f1', 'a@utdallas.edu'), ('00000000-0000-4000-8000-0000000000f2', 'b@utdallas.edu');
insert into public.competitions (id, title, status) values
  ('50000000-0000-4000-8000-000000000001', 'Muted For A', 'live'), ('50000000-0000-4000-8000-000000000002', 'Not Muted', 'live');
insert into public.stages (competition_id, name, deadline_at) values
  ('50000000-0000-4000-8000-000000000001', 'R', now() + interval '3 days'),
  ('50000000-0000-4000-8000-000000000002', 'R', now() + interval '3 days');
insert into public.saves values
  ('00000000-0000-4000-8000-0000000000f1', '50000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000f2', '50000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000f1', '50000000-0000-4000-8000-000000000002');
insert into public.warning_mutes values ('00000000-0000-4000-8000-0000000000f1', '50000000-0000-4000-8000-000000000001');

do $$
declare n int;
begin
  -- A muted "Muted For A"; B still gets it; A still gets the other one.
  select count(*) into n from public.stages_due_between(now() + interval '2 days', now() + interval '4 days');
  if n <> 2 then raise exception 'expected 2 candidates (A muted for one), got %', n; end if;
  if exists (select 1 from public.stages_due_between(now() + interval '2 days', now() + interval '4 days')
             where email = 'a@utdallas.edu' and title = 'Muted For A') then raise exception 'muted warning leaked'; end if;
  -- muting does not unsave
  if not exists (select 1 from public.saves where user_id = '00000000-0000-4000-8000-0000000000f1' and competition_id = '50000000-0000-4000-8000-000000000001')
  then raise exception 'mute must keep the save'; end if;
end $$;

-- users can only see/undo their own mutes
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000f2', false);
do $$ begin
  if (select count(*) from public.warning_mutes) <> 0 then raise exception 'B must not see A''s mute'; end if;
  begin insert into public.warning_mutes values ('00000000-0000-4000-8000-0000000000f2', '50000000-0000-4000-8000-000000000002');
    raise exception 'clients must not insert mutes directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
truncate public.warning_mutes, public.saves, public.stages, public.competitions cascade;
delete from auth.users;
