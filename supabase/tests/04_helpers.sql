\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'alice@utdallas.edu'),
  ('00000000-0000-4000-8000-0000000000b2', 'bob@utdallas.edu');
update public.users set email_warnings = false where email = 'bob@utdallas.edu';

insert into public.competitions (id, title, status, embedding) values
  ('20000000-0000-4000-8000-000000000001', 'Near Comp', 'live', array_fill(0.1::real, array[768])::extensions.vector),
  ('20000000-0000-4000-8000-000000000002', 'Far Comp', 'live', array_fill(0.1::real, array[768])::extensions.vector),
  ('20000000-0000-4000-8000-000000000003', 'Past Comp', 'past', null);
insert into public.stages (competition_id, name, deadline_at, "order") values
  ('20000000-0000-4000-8000-000000000001', 'Reg', now() + interval '3 days', 1),
  ('20000000-0000-4000-8000-000000000001', 'Final', now() + interval '20 days', 2),
  ('20000000-0000-4000-8000-000000000002', 'Reg', now() + interval '200 days', 1),
  ('20000000-0000-4000-8000-000000000003', 'Only', now() - interval '30 days', 1);
insert into public.saves values
  ('00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-000000000001');

do $$
declare r record; n int;
begin
  -- next deadline is the nearest future stage
  if public.competition_next_deadline('20000000-0000-4000-8000-000000000001') > now() + interval '4 days' then
    raise exception 'next deadline should be the 3-day stage';
  end if;
  if public.competition_next_deadline('20000000-0000-4000-8000-000000000003') is not null then
    raise exception 'past competition should have no upcoming deadline';
  end if;

  -- cards: upcoming stage preferred; past comp falls back to its last stage
  select * into r from public.competition_cards where id = '20000000-0000-4000-8000-000000000001';
  if r.next_stage_name <> 'Reg' or not r.has_upcoming then raise exception 'card next stage wrong: %', r.next_stage_name; end if;
  select * into r from public.competition_cards where id = '20000000-0000-4000-8000-000000000003';
  if r.next_stage_name <> 'Only' or r.has_upcoming then raise exception 'past card fallback wrong'; end if;

  -- match: identical vectors, around 'now+5d' +/-45d -> Near matches; Far (200d) is outside the window
  select count(*) into n from public.match_competitions(
    array_fill(0.1::real, array[768])::extensions.vector, now() + interval '5 days', 45, 0.8);
  if n <> 1 then raise exception 'expected 1 match within window, got %', n; end if;
  -- the nearest stage deadline is returned so same-event checks can compare dates
  if (select abs(extract(epoch from (nearest_deadline - (now() + interval '5 days')))) from public.match_competitions(
        array_fill(0.1::real, array[768])::extensions.vector, now() + interval '5 days', 45, 0.8)) > 30 * 86400 then
    raise exception 'nearest_deadline should be within the window of the query date';
  end if;
  -- orthogonal-ish vector falls below threshold
  select count(*) into n from public.match_competitions(
    (select array_agg(case when g = 1 then 1.0::real else 0.0::real end) from generate_series(1, 768) g)::extensions.vector,
    now() + interval '5 days', 45, 0.9);
  if n <> 0 then raise exception 'dissimilar vector should not match, got %', n; end if;

  -- warnings: only users with email_warnings on, only stages in the window
  select count(*) into n from public.stages_due_between(now() + interval '2 days', now() + interval '4 days');
  if n <> 1 then raise exception 'expected 1 warning candidate (bob has warnings off), got %', n; end if;
  select count(*) into n from public.stages_due_between(now() + interval '100 days', now() + interval '300 days');
  if n <> 0 then raise exception 'unsaved stage must not be a warning candidate'; end if;
end $$;

-- service-only functions are not callable by authenticated
set role authenticated;
do $$ begin
  begin
    perform * from public.stages_due_between(now(), now() + interval '1 day');
    raise exception 'authenticated should not call stages_due_between';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

truncate public.saves, public.stages, public.competitions cascade;
delete from auth.users;
