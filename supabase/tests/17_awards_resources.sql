\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000c1', 'officer@utdallas.edu', '{}'),
  ('00000000-0000-4000-8000-0000000000c2', 'ada@utdallas.edu', '{"name":"Ada Lovelace"}'),
  ('00000000-0000-4000-8000-0000000000c3', 'bo@utdallas.edu', '{"name":"Bo Peep"}'),
  ('00000000-0000-4000-8000-0000000000c4', 'cy@utdallas.edu', '{"name":"Cy"}');
update public.users set name = 'Ada Lovelace', public_results = true where email = 'ada@utdallas.edu';
update public.users set name = 'Bo Peep' where email = 'bo@utdallas.edu';          -- not opted in
update public.users set name = 'Cy', public_results = true where email = 'cy@utdallas.edu';  -- single name
insert into public.orgs (id, name, slug, claimed_by) values ('d0000000-0000-4000-8000-000000000001', 'AIS', 'ais', '00000000-0000-4000-8000-0000000000c1');
insert into public.competitions (id, title, status, host_org_id) values
  ('e0000000-0000-4000-8000-000000000001', 'AIS Case', 'live', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'Other', 'live', null);
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false); end $$;

set role authenticated;
do $$
declare rid uuid;
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
  rid := public.officer_add_resource('e0000000-0000-4000-8000-000000000001', '  Past case  ', 'https://example.com/case');
  begin perform public.officer_add_resource('e0000000-0000-4000-8000-000000000001', 'x', 'javascript:alert(1)'); raise exception 'unsafe url accepted';
  exception when check_violation then null; end;
  begin perform public.officer_add_resource('e0000000-0000-4000-8000-000000000001', '', 'https://example.com'); raise exception 'blank label accepted';
  exception when check_violation then null; end;
  begin perform public.officer_add_resource('e0000000-0000-4000-8000-000000000002', 'x', 'https://example.com'); raise exception 'added to another org''s competition';
  exception when insufficient_privilege then null; end;
  perform public.officer_upload_results('e0000000-0000-4000-8000-000000000001',
    '[{"email":"ada@utdallas.edu","result":"first"},{"email":"bo@utdallas.edu","result":"second","team_name":"Team Bo"},{"email":"cy@utdallas.edu","result":"third"}]');
  -- another student cannot remove it
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000c2');
  begin perform public.officer_remove_resource(rid); raise exception 'student removed a resource'; exception when insufficient_privilege then null; end;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
  if not public.officer_remove_resource(rid) then raise exception 'officer could not remove'; end if;
  if public.officer_remove_resource(rid) then raise exception 'removed twice'; end if;
  perform public.officer_add_resource('e0000000-0000-4000-8000-000000000001', 'Rubric', 'https://example.com/rubric');
  -- users can opt in themselves but cannot touch other columns of this kind
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
  update public.users set public_results = true where id = '00000000-0000-4000-8000-0000000000c3';
  update public.users set public_results = false where id = '00000000-0000-4000-8000-0000000000c3';
end $$;
reset role;

set role anon;
do $$
declare r record; names text := '';
begin
  if (select count(*) from public.competition_resources where competition_id = 'e0000000-0000-4000-8000-000000000001') <> 1 then raise exception 'visitors should see the resource'; end if;
  for r in select * from public.past_winners('e0000000-0000-4000-8000-000000000001') loop names := names || r.place || ':' || coalesce(r.display, '-') || ':' || coalesce(r.team_name, '-') || ' '; end loop;
  if names <> 'first:Ada L.:- second:-:Team Bo third:Cy:- ' then raise exception 'winners wrong: %', names; end if;
  if (select count(*) from public.past_winners('e0000000-0000-4000-8000-000000000002')) <> 0 then raise exception 'phantom winners'; end if;
  begin perform 1 from public.entries; raise exception 'anon read entries'; exception when insufficient_privilege then null; end;
end $$;
reset role;
truncate public.entries, public.competition_resources, public.competitions, public.orgs cascade; delete from auth.users;
