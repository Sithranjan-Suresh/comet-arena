\set ON_ERROR_STOP on
do $$
declare r record; n int; v text := '[' || array_to_string(array_fill(0.1::real, array[768]), ',') || ']';
begin
  -- publish a full competition atomically
  select * into r from public.publish_competition(jsonb_build_object(
    'competition', jsonb_build_object('title','AIS Fall Case Competition','host_name','AIS','categories',jsonb_build_array('case_competition','finance'),
      'status','unverified','confidence',0.92,'cost','free','format','in_person','register_url','https://example.com/r','embedding',v),
    'stages', jsonb_build_array(
      jsonb_build_object('name','Finals','starts_at','2026-12-05T15:00:00Z','deadline_at','2026-12-05T23:00:00Z'),
      jsonb_build_object('name','Registration closes','starts_at',null,'deadline_at','2026-11-21T05:59:00Z')),
    'eligibility', jsonb_build_object('majors',jsonb_build_array('Accounting'),'class_years',jsonb_build_array(),'team_min',3,'team_max',4),
    'sources', jsonb_build_array(jsonb_build_object('source','instagram','source_url','https://instagram.example/p/1','external_id','ig-1'))));
  if r.slug <> 'ais-fall-case-competition' then raise exception 'unexpected slug %', r.slug; end if;
  select count(*) into n from public.stages where competition_id = r.id;
  if n <> 2 then raise exception 'expected 2 stages, got %', n; end if;
  -- stage order follows deadline order, not input order
  if (select name from public.stages where competition_id = r.id and "order" = 1) <> 'Registration closes' then
    raise exception 'stage order should follow deadlines'; end if;
  if (select team_max from public.eligibility where competition_id = r.id) <> 4 then raise exception 'eligibility missing'; end if;
  if (select embedding is not null from public.competitions where id = r.id) is not true then raise exception 'embedding missing'; end if;

  -- a failure in a child insert rolls EVERYTHING back (no orphan competition)
  begin
    perform public.publish_competition(jsonb_build_object(
      'competition', jsonb_build_object('title','Atomic Test'),
      'stages', jsonb_build_array(jsonb_build_object('name','x','deadline_at','not-a-date'))));
    raise exception 'should have failed';
  exception when others then
    if sqlerrm = 'should have failed' then raise; end if;
  end;
  if exists (select 1 from public.competitions where title = 'Atomic Test') then raise exception 'partial write leaked'; end if;

  -- merge fills only empty fields, bumps confirmations, adds a source
  perform public.merge_into_competition(r.id,
    jsonb_build_object('host_name','Other Host','description','Teams solve a case','prize','$2,500','cost','paid','format','virtual','categories',jsonb_build_array('hackathon')),
    jsonb_build_object('source','instagram','source_url','https://instagram.example/p/2','external_id','ig-2'));
  select * into r from public.competitions where id = r.id;
  if r.host_name <> 'AIS' then raise exception 'host_name must not be overwritten'; end if;
  if r.description <> 'Teams solve a case' or r.prize <> '$2,500' then raise exception 'null fields should be filled'; end if;
  if r.cost <> 'free' or r.format <> 'in_person' then raise exception 'known enums must not be overwritten'; end if;
  if r.categories <> array['case_competition','finance'] then raise exception 'categories must not be overwritten'; end if;
  if r.confirmations <> 1 then raise exception 'confirmations should be 1'; end if;
  select count(*) into n from public.competition_sources where competition_id = r.id;
  if n <> 2 then raise exception 'expected 2 sources, got %', n; end if;

  -- the same external id cannot be attached twice
  begin
    perform public.merge_into_competition(r.id, '{}'::jsonb, jsonb_build_object('source','instagram','source_url','x','external_id','ig-2'));
  exception when unique_violation then raise exception 'merge should be idempotent on duplicate external ids';
  end;

  -- unknown competition
  begin
    perform public.merge_into_competition('00000000-0000-4000-8000-00000000ffff', '{}'::jsonb, null);
    raise exception 'should have failed';
  exception when others then
    if sqlerrm = 'should have failed' then raise; end if;
  end;
end $$;

-- clients cannot call these
set role authenticated;
do $$ begin
  begin perform public.publish_competition('{}'::jsonb); raise exception 'authenticated must not publish';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
truncate public.competition_sources, public.stages, public.eligibility, public.competitions cascade;
