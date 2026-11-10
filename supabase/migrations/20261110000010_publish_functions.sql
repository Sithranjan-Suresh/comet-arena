-- Task 49: atomic publish/merge functions for the extraction pipeline (service role only),
-- plus a flag for competitions published while the embedding service was down.

alter table public.competitions add column needs_dedupe boolean not null default false;
create index competitions_needs_dedupe_idx on public.competitions (id) where needs_dedupe;

-- Create a competition with its stages, eligibility and sources in ONE transaction.
-- p = {
--   competition: {title, host_org_id, host_name, categories[], description, tier, prize, cost, format,
--                 location, register_url, utd_only, beginner_friendly, status, confidence, flyer_url,
--                 embedding("[..]"), needs_dedupe, created_by},
--   stages: [{name, starts_at, deadline_at}], eligibility: {...}, sources: [{source, source_url, external_id}] }
create or replace function public.publish_competition(p jsonb)
returns table (id uuid, slug text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  c jsonb := p -> 'competition';
  new_id uuid;
  new_slug text;
begin
  insert into public.competitions (
    title, host_org_id, host_name, categories, description, tier, prize, cost, format, location,
    register_url, utd_only, beginner_friendly, status, confidence, flyer_url, embedding, needs_dedupe, created_by
  ) values (
    c ->> 'title',
    nullif(c ->> 'host_org_id', '')::uuid,
    c ->> 'host_name',
    coalesce(array(select jsonb_array_elements_text(coalesce(c -> 'categories', '[]'::jsonb))), '{}'),
    c ->> 'description',
    coalesce(c ->> 'tier', 'campus')::public.competition_tier,
    c ->> 'prize',
    coalesce(c ->> 'cost', 'unknown')::public.competition_cost,
    coalesce(c ->> 'format', 'unknown')::public.competition_format,
    c ->> 'location',
    c ->> 'register_url',
    coalesce((c ->> 'utd_only')::boolean, true),
    coalesce((c ->> 'beginner_friendly')::boolean, false),
    coalesce(c ->> 'status', 'unverified')::public.competition_status,
    (c ->> 'confidence')::real,
    c ->> 'flyer_url',
    nullif(c ->> 'embedding', '')::extensions.vector,
    coalesce((c ->> 'needs_dedupe')::boolean, false),
    nullif(c ->> 'created_by', '')::uuid
  ) returning competitions.id, competitions.slug into new_id, new_slug;

  insert into public.stages (competition_id, name, starts_at, deadline_at, "order")
  select new_id, s ->> 'name', nullif(s ->> 'starts_at', '')::timestamptz, (s ->> 'deadline_at')::timestamptz,
         (row_number() over (order by (s ->> 'deadline_at')::timestamptz))::int
  from jsonb_array_elements(coalesce(p -> 'stages', '[]'::jsonb)) s;

  insert into public.eligibility (competition_id, majors, class_years, course_prereqs, team_min, team_max, cross_school)
  select new_id,
         coalesce(array(select jsonb_array_elements_text(coalesce(e -> 'majors', '[]'::jsonb))), '{}'),
         coalesce(array(select jsonb_array_elements_text(coalesce(e -> 'class_years', '[]'::jsonb))), '{}'),
         '{}',
         nullif(e ->> 'team_min', '')::int,
         nullif(e ->> 'team_max', '')::int,
         coalesce((e ->> 'cross_school')::boolean, false)
  from (select coalesce(p -> 'eligibility', '{}'::jsonb) as e) x;

  insert into public.competition_sources (competition_id, source, source_url, external_id)
  select new_id, (s ->> 'source')::public.source_type, s ->> 'source_url', nullif(s ->> 'external_id', '')
  from jsonb_array_elements(coalesce(p -> 'sources', '[]'::jsonb)) s;

  return query select new_id, new_slug;
end $$;

-- Merge a duplicate into an existing competition: add the source, +1 confirmation, and fill ONLY
-- fields that are still empty (never overwrite what is known).
-- p_patch keys: host_name, description, prize, location, register_url, flyer_url, cost, format, categories[]
create or replace function public.merge_into_competition(p_id uuid, p_patch jsonb, p_source jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.competitions c set
    host_name = coalesce(c.host_name, p_patch ->> 'host_name'),
    description = coalesce(c.description, p_patch ->> 'description'),
    prize = coalesce(c.prize, p_patch ->> 'prize'),
    location = coalesce(c.location, p_patch ->> 'location'),
    register_url = coalesce(c.register_url, p_patch ->> 'register_url'),
    flyer_url = coalesce(c.flyer_url, p_patch ->> 'flyer_url'),
    cost = case when c.cost = 'unknown' and p_patch ? 'cost' then (p_patch ->> 'cost')::public.competition_cost else c.cost end,
    format = case when c.format = 'unknown' and p_patch ? 'format' then (p_patch ->> 'format')::public.competition_format else c.format end,
    categories = case when cardinality(c.categories) = 0 and p_patch ? 'categories'
                      then coalesce(array(select jsonb_array_elements_text(p_patch -> 'categories')), '{}') else c.categories end,
    confirmations = c.confirmations + 1
  where c.id = p_id;
  if not found then raise exception 'competition % not found', p_id; end if;

  if p_source is not null and p_source ->> 'source' is not null then
    insert into public.competition_sources (competition_id, source, source_url, external_id)
    values (p_id, (p_source ->> 'source')::public.source_type, p_source ->> 'source_url', nullif(p_source ->> 'external_id', ''))
    on conflict do nothing;
  end if;
end $$;

revoke all on function public.publish_competition(jsonb) from public, anon, authenticated;
revoke all on function public.merge_into_competition(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.publish_competition(jsonb) to service_role;
grant execute on function public.merge_into_competition(uuid, jsonb, jsonb) to service_role;
