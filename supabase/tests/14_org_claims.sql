\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'officer@utdallas.edu'),
  ('00000000-0000-4000-8000-0000000000a2', 'other@utdallas.edu'),
  ('00000000-0000-4000-8000-0000000000a3', 'admin@utdallas.edu');
update public.users set is_admin = true where email = 'admin@utdallas.edu';
insert into public.orgs (id, name, slug) values ('80000000-0000-4000-8000-000000000001', 'AIS', 'ais');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false); end $$;

set role authenticated;
do $$
declare cid uuid;
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
  insert into public.org_claims (org_id, user_id, note) values ('80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'I am the president') returning id into cid;
  begin insert into public.org_claims (org_id, user_id) values ('80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1');
    raise exception 'second pending claim allowed'; exception when unique_violation then null; end;
  begin insert into public.org_claims (org_id, user_id) values ('80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2');
    raise exception 'claim filed as someone else'; exception when insufficient_privilege then null; end;
  begin insert into public.org_claims (org_id, user_id, status) values ('80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'approved');
    raise exception 'self-approved claim allowed'; exception when insufficient_privilege or unique_violation then null; end;
  begin update public.org_claims set status = 'approved' where id = cid; if found then raise exception 'student approved own claim'; end if;
    exception when insufficient_privilege then null; end;
  begin update public.orgs set claimed_by = '00000000-0000-4000-8000-0000000000a1' where id = '80000000-0000-4000-8000-000000000001';
    if found then raise exception 'student claimed an org directly'; end if; exception when insufficient_privilege then null; end;
  -- others cannot see the claim; the admin can
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
  if (select count(*) from public.org_claims) <> 0 then raise exception 'claim visible to another student'; end if;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
  if (select count(*) from public.org_claims) <> 1 then raise exception 'admin cannot see the claim'; end if;
  begin perform public.decide_org_claim(cid, true, '00000000-0000-4000-8000-0000000000a3'); raise exception 'decide callable by client';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare cid uuid; r text;
begin
  select id into cid from public.org_claims limit 1;
  r := public.decide_org_claim(cid, true, '00000000-0000-4000-8000-0000000000a3');
  if r <> 'approved' then raise exception 'expected approved, got %', r; end if;
  if (select claimed_by from public.orgs where slug = 'ais') <> '00000000-0000-4000-8000-0000000000a1' then raise exception 'claimed_by not set'; end if;
  if not (select verified from public.orgs where slug = 'ais') then raise exception 'org not verified'; end if;
  if public.decide_org_claim(cid, true, '00000000-0000-4000-8000-0000000000a3') <> 'already_decided' then raise exception 'double decision allowed'; end if;
  -- a second claimant loses once the org is taken
  insert into public.org_claims (org_id, user_id) values ('80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2') returning id into cid;
  if public.decide_org_claim(cid, true, '00000000-0000-4000-8000-0000000000a3') <> 'already_claimed' then raise exception 'org claimed twice'; end if;
  if public.decide_org_claim(cid, false, '00000000-0000-4000-8000-0000000000a3') <> 'rejected' then raise exception 'reject failed'; end if;
  if public.decide_org_claim('00000000-0000-4000-8000-0000000000ff', true, null) <> 'not_found' then raise exception 'missing claim'; end if;
end $$;
truncate public.org_claims cascade; truncate public.orgs cascade; delete from auth.users;
