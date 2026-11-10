-- Bug found by the Task 112 query-budget run: The Field's text search filters competition_cards on
-- `description`, but the view never exposed it, so search would have failed against a real database
-- (mock mode reads fixtures and never hit it). Columns can only be appended to a view, so it goes last.
create or replace view public.competition_cards with (security_invoker = true) as
select
  c.id, c.slug, c.title, c.host_org_id, c.host_name, o.slug as host_slug, c.categories, c.prize,
  c.status, c.tier, c.cost, c.format, c.utd_only, c.beginner_friendly, c.updated_at,
  c.search_tsv,
  s.id as next_stage_id, s.name as next_stage_name, s.starts_at as next_stage_starts_at,
  s.deadline_at as next_stage_deadline_at, s."order" as next_stage_order,
  (s.deadline_at >= now()) as has_upcoming,
  c.description
from public.competitions c
left join public.orgs o on o.id = c.host_org_id
left join lateral (
  select st.* from public.stages st
  where st.competition_id = c.id
  order by (st.deadline_at >= now()) desc,
           case when st.deadline_at >= now() then st.deadline_at end asc,
           st.deadline_at desc
  limit 1
) s on true;
grant select on public.competition_cards to anon, authenticated;
