\set ON_ERROR_STOP on
-- Deleting an auth user must remove every piece of their personal data and keep shared content.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000d4', 'gone@utdallas.edu');
insert into public.competitions (id, title, status, created_by) values
  ('30000000-0000-4000-8000-000000000001', 'Shared Comp', 'live', '00000000-0000-4000-8000-0000000000d4');
insert into public.saves values ('00000000-0000-4000-8000-0000000000d4', '30000000-0000-4000-8000-000000000001');
insert into public.entries (user_id, competition_id) values ('00000000-0000-4000-8000-0000000000d4', '30000000-0000-4000-8000-000000000001');
insert into public.free_agents (user_id, competition_id, roles) values ('00000000-0000-4000-8000-0000000000d4', '30000000-0000-4000-8000-000000000001', '{dev}');
insert into public.team_openings (user_id, competition_id, team_name, roles_needed) values ('00000000-0000-4000-8000-0000000000d4', '30000000-0000-4000-8000-000000000001', 'T', '{dev}');
insert into public.flags (competition_id, user_id, field) values ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d4', 'title');
insert into public.submissions (user_id, raw_url) values ('00000000-0000-4000-8000-0000000000d4', 'https://example.com');

delete from auth.users where id = '00000000-0000-4000-8000-0000000000d4';

do $$
declare n int;
begin
  select (select count(*) from public.users) + (select count(*) from public.saves) + (select count(*) from public.entries)
       + (select count(*) from public.free_agents) + (select count(*) from public.team_openings)
       + (select count(*) from public.flags) + (select count(*) from public.submissions) into n;
  if n <> 0 then raise exception 'personal data survived account deletion (% rows)', n; end if;
  -- The competition they submitted stays, with the creator unlinked.
  if not exists (select 1 from public.competitions where slug is not null and title = 'Shared Comp' and created_by is null) then
    raise exception 'shared competition should remain with created_by cleared';
  end if;
end $$;
truncate public.competitions cascade;
