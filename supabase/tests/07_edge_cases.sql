\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000e5', 'saver@utdallas.edu');
do $$
declare cid uuid; reg_id uuid; fin_id uuid; r boolean; n int; st record;
begin
  select id into cid from public.publish_competition(jsonb_build_object(
    'competition', jsonb_build_object('title','Fall Case Comp','status','unverified'),
    'stages', jsonb_build_array(
      jsonb_build_object('name','Registration','deadline_at','2026-11-20T23:59:00Z'),
      jsonb_build_object('name','Finals','deadline_at','2026-12-05T23:00:00Z'))));
  select id into reg_id from public.stages where competition_id = cid and name = 'Registration';
  select id into fin_id from public.stages where competition_id = cid and name = 'Finals';
  insert into public.saves values ('00000000-0000-4000-8000-0000000000e5', cid);
  insert into public.warnings_sent values ('00000000-0000-4000-8000-0000000000e5', reg_id, 'd7');

  -- identical repost: nothing changes, no notification record
  r := public.apply_stage_update(cid, jsonb_build_array(
    jsonb_build_object('name','registration','deadline_at','2026-11-20T23:59:00Z'),
    jsonb_build_object('name','Finals','deadline_at','2026-12-05T23:00:00Z')));
  if r then raise exception 'identical stages must not count as a change'; end if;
  if exists (select 1 from public.competition_changes where competition_id = cid) then raise exception 'no change record expected'; end if;

  -- repost with a moved Registration deadline, a new stage, and Finals dropped
  r := public.apply_stage_update(cid, jsonb_build_array(
    jsonb_build_object('name','Registration','deadline_at','2026-11-27T23:59:00Z'),
    jsonb_build_object('name','Semifinals','deadline_at','2026-12-02T23:00:00Z')));
  if not r then raise exception 'changes must be reported'; end if;

  -- stage id survives => saves and warning idempotency are intact
  if (select deadline_at from public.stages where id = reg_id) <> '2026-11-27T23:59:00Z' then raise exception 'registration not updated in place'; end if;
  if not exists (select 1 from public.warnings_sent where stage_id = reg_id) then raise exception 'warnings_sent lost'; end if;
  if not exists (select 1 from public.saves where competition_id = cid) then raise exception 'save lost'; end if;
  if exists (select 1 from public.stages where id = fin_id) then raise exception 'removed stage should be deleted'; end if;
  select count(*) into n from public.stages where competition_id = cid;
  if n <> 2 then raise exception 'expected 2 stages, got %', n; end if;
  -- order follows deadlines
  for st in select name, "order" from public.stages where competition_id = cid loop
    if (st.name = 'Registration' and st."order" <> 1) or (st.name = 'Semifinals' and st."order" <> 2) then raise exception 'order wrong for %', st.name; end if;
  end loop;
  -- one change record with before/after
  select count(*) into n from public.competition_changes where competition_id = cid and notified_at is null;
  if n <> 1 then raise exception 'expected 1 pending change record, got %', n; end if;
  if (select jsonb_array_length(summary -> 'before') from public.competition_changes where competition_id = cid) <> 2 then raise exception 'before snapshot wrong'; end if;

  -- an empty stage list never wipes existing stages
  r := public.apply_stage_update(cid, '[]'::jsonb);
  if r or (select count(*) from public.stages where competition_id = cid) <> 2 then raise exception 'empty update must be a no-op'; end if;

  -- expected (undated) competition gets dates: becomes unverified and records NO change (first dates)
  select id into cid from public.publish_competition(jsonb_build_object('competition', jsonb_build_object('title','Annual Mock Trial','status','expected')));
  r := public.apply_stage_update(cid, jsonb_build_array(jsonb_build_object('name','Contest','deadline_at','2027-03-10T23:00:00Z')));
  if not r then raise exception 'new dates should count as change'; end if;
  if (select status from public.competitions where id = cid) <> 'unverified' then raise exception 'expected should become unverified'; end if;
  if exists (select 1 from public.competition_changes where competition_id = cid) then raise exception 'first dates must not notify savers'; end if;

  -- recap matching: same title matches, a different season does not
  perform public.publish_competition(jsonb_build_object('competition', jsonb_build_object('title','AIS Fall Case Competition')));
  select count(*) into n from public.match_competition_by_title('AIS Fall Case Competition');
  if n < 1 then raise exception 'identical title should match'; end if;
  select count(*) into n from public.match_competition_by_title('AIS Spring Case Competition');
  if n <> 0 then raise exception 'a different season must not match (got %)', n; end if;
end $$;
truncate public.competition_changes, public.warnings_sent, public.saves, public.stages, public.competitions cascade;
delete from auth.users;
