-- Task 106 (dedupe eval finding): "same title + same host" promoted a recurring series (Startup Pitch Night,
-- Nov 12 vs Dec 10) to a merge. Matches now also return the stage deadline nearest to the new post so the
-- app can require the dates to be close before it treats a review-band match as the same event.
drop function if exists public.match_competitions(extensions.vector, timestamptz, integer, real, integer);
create function public.match_competitions(
  p_embedding extensions.vector(768),
  p_around timestamptz,
  p_window_days integer default 45,
  p_min_similarity real default 0.8,
  p_limit integer default 5
) returns table (id uuid, slug text, title text, host_name text, similarity real, nearest_deadline timestamptz)
language sql stable set search_path = public, extensions as $$
  select c.id, c.slug, c.title, c.host_name, (1 - (c.embedding <=> p_embedding))::real as similarity,
    (select s.deadline_at from public.stages s where s.competition_id = c.id
      order by abs(extract(epoch from (s.deadline_at - p_around))) limit 1) as nearest_deadline
  from public.competitions c
  where c.embedding is not null
    and c.status <> 'rejected'
    and exists (
      select 1 from public.stages s
      where s.competition_id = c.id
        and s.deadline_at between p_around - make_interval(days => p_window_days)
                              and p_around + make_interval(days => p_window_days))
    and (1 - (c.embedding <=> p_embedding)) >= p_min_similarity
  order by c.embedding <=> p_embedding
  limit p_limit
$$;
revoke all on function public.match_competitions(extensions.vector, timestamptz, integer, real, integer)
  from public, anon, authenticated;
grant execute on function public.match_competitions(extensions.vector, timestamptz, integer, real, integer)
  to service_role;
