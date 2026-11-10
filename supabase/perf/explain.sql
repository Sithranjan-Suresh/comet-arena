-- Query-time budget check (Task 112). Loads a realistic data volume (about 10x the launch target) into a
-- throwaway database, then times every hot query. Fails if any takes more than 150 ms.
--   scripts/db-test.sh reset && scripts/db-test.sh psql -f supabase/perf/explain.sql
\set ON_ERROR_STOP on
\timing off

insert into auth.users (id, email)
select gen_random_uuid(), 'u' || g || '@utdallas.edu' from generate_series(1, 5000) g;

insert into public.orgs (name, slug)
select 'Org ' || g, 'org-' || g from generate_series(1, 600) g;

insert into public.competitions (title, slug, host_name, categories, description, status, format, cost, utd_only, embedding)
select 'Competition ' || g || ' ' || (array['Case','Hack','Pitch','Design','Thesis'])[1 + g % 5],
       'comp-' || g, 'Org ' || (1 + g % 600),
       array[(array['case_competition','hackathon','pitch','design','research','speaking'])[1 + g % 6]]::text[],
       'A competition about ' || (array['finance','robots','startups','data','art'])[1 + g % 5] || ' number ' || g,
       (array['live','live','unverified','past'])[1 + g % 4]::public.competition_status,
       (array['in_person','virtual','hybrid'])[1 + g % 3]::public.competition_format,
       (array['free','paid','unknown'])[1 + g % 3]::public.competition_cost,
       g % 4 <> 0,
       (select array_agg(random()::real) from generate_series(1, 768))::extensions.vector
from generate_series(1, 2000) g;

insert into public.stages (competition_id, name, deadline_at, "order")
select c.id, n.name, now() + ((row_number() over ()) % 90 - 20) * interval '1 day' + n.o * interval '9 days', n.o
from public.competitions c, (values ('Registration', 1), ('Round 1', 2), ('Finals', 3)) as n(name, o);

insert into public.saves (user_id, competition_id)
select u.id, c.id
from (select id from auth.users) u
cross join lateral (select id from public.competitions order by random() limit 8) c
on conflict do nothing;

analyze;

create temp table timings (name text, ms numeric);
create or replace function pg_temp.time_it(name text, q text) returns void language plpgsql as $$
declare t0 timestamptz; t1 timestamptz;
begin
  execute q;  -- warm
  t0 := clock_timestamp(); execute q; t1 := clock_timestamp();
  insert into timings values (name, round(extract(epoch from (t1 - t0)) * 1000, 1));
end $$;

select pg_temp.time_it('Field default page (20, soonest first)', $q$
  select * from public.competition_cards where status in ('live','unverified')
  order by has_upcoming desc nulls last, next_stage_deadline_at asc nulls last, id limit 21 $q$);
select pg_temp.time_it('Field filtered by category', $q$
  select * from public.competition_cards where status in ('live','unverified') and categories && array['hackathon']
  order by has_upcoming desc nulls last, next_stage_deadline_at asc nulls last, id limit 21 $q$);
select pg_temp.time_it('Field text search (ilike title/host/description)', $q$
  select * from public.competition_cards where status in ('live','unverified')
    and (title ilike '%pitch%' or host_name ilike '%pitch%' or description ilike '%pitch%')
  order by has_upcoming desc nulls last, next_stage_deadline_at asc nulls last, id limit 21 $q$);
select pg_temp.time_it('Game Day lookup by slug + stages', $q$
  select c.*, (select jsonb_agg(s order by s."order") from public.stages s where s.competition_id = c.id)
  from public.competitions c where c.slug = 'comp-1234' $q$);
select pg_temp.time_it('Dedupe: nearest embeddings in a 45-day window', $q$
  select * from public.match_competitions(
    (select embedding from public.competitions limit 1), now(), 45, 0.8, 5) $q$);
select pg_temp.time_it('Warnings: stages due in a 1-hour window', $q$
  select count(*) from public.stages_due_between(now() + interval '7 days' - interval '30 minutes', now() + interval '7 days' + interval '30 minutes') $q$);
select pg_temp.time_it('Schedule: one user''s saved stages', $q$
  select s.* from public.saves sv join public.stages s on s.competition_id = sv.competition_id
  where sv.user_id = (select user_id from public.saves limit 1) order by s.deadline_at $q$);
select pg_temp.time_it('Digest: all saves with next stage (per-user ranking input)', $q$
  select sv.user_id, count(*) from public.saves sv join public.stages s on s.competition_id = sv.competition_id
  where s.deadline_at between now() and now() + interval '14 days' group by sv.user_id $q$);

select name, ms || ' ms' as time from timings order by name;
do $$
declare worst record;
begin
  select * into worst from timings order by ms desc limit 1;
  if (select max(ms) from timings) > 150 then
    raise exception 'Slowest query % took % ms (budget 150 ms)', worst.name, worst.ms;
  end if;
  raise notice 'All queries within the 150 ms budget (slowest: % at % ms)', worst.name, worst.ms;
end $$;
