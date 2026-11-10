-- Task 118: how close are these competitions to a given embedding (a student's interests)? Used by the
-- Scouting Report to boost lookalikes of what the student likes. Runs as the caller, so RLS still applies.
create or replace function public.similarity_to(p_embedding extensions.vector(768), p_ids uuid[])
returns table (id uuid, similarity real)
language sql stable set search_path = public, extensions as $$
  select c.id, (1 - (c.embedding <=> p_embedding))::real
  from public.competitions c
  where c.id = any(p_ids) and c.embedding is not null
$$;
revoke all on function public.similarity_to(extensions.vector, uuid[]) from public;
grant execute on function public.similarity_to(extensions.vector, uuid[]) to anon, authenticated, service_role;
