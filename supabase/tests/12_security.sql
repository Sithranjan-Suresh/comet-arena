\set ON_ERROR_STOP on
-- Task 114: structural security checks that must keep holding as migrations are added.

do $$
declare r record; bad text := '';
begin
  -- 1. Every public table has row-level security on (default deny).
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity loop
    bad := bad || r.relname || ' ';
  end loop;
  if bad <> '' then raise exception 'tables without RLS: %', bad; end if;

  -- 2. Visitors (anon) cannot read anything personal or operational, even before policies apply.
  bad := '';
  for r in select t from unnest(array[
      'users','saves','entries','free_agents','team_openings','email_subscribers','warnings_sent',
      'review_queue','nebula_cache','ingest_posts','submissions','competition_changes','flags','warning_mutes'
    ]) t loop
    if has_table_privilege('anon', 'public.' || r.t, 'select,insert,update,delete') then bad := bad || r.t || ' '; end if;
  end loop;
  if bad <> '' then raise exception 'anon has privileges on: %', bad; end if;

  -- 3. Service-only tables are not reachable by signed-in users either.
  bad := '';
  for r in select t from unnest(array['email_subscribers','warnings_sent','nebula_cache','competition_changes']) t loop
    if has_table_privilege('authenticated', 'public.' || r.t, 'select,insert,update,delete') then bad := bad || r.t || ' '; end if;
  end loop;
  if bad <> '' then raise exception 'authenticated has privileges on service-only tables: %', bad; end if;

  -- 4. Privileged (security definer) functions: visitors can call none (except is_admin, which only reads the
  --    caller's own flag), and students only the reviewed allowlist, each of which checks auth.uid() itself.
  bad := '';
  for r in select p.proname, p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef
             and p.prorettype <> 'pg_catalog.trigger'::regtype  -- trigger functions cannot be called as RPC
             and p.proname <> 'is_admin' loop
    if has_function_privilege('anon', r.oid, 'execute') and r.proname not in ('standings', 'standings_seasons') then bad := bad || r.proname || '(anon) '; end if;
    if has_function_privilege('authenticated', r.oid, 'execute') and r.proname not in ('standings', 'standings_seasons', 'confirm_competition', 'is_officer_of_competition', 'officer_update_competition', 'officer_set_stages', 'officer_upload_results') then
      bad := bad || r.proname || '(authenticated) ';
    end if;
  end loop;
  if bad <> '' then raise exception 'security definer functions callable by clients: %', bad; end if;

  -- 5. Nobody can promote themselves: users.is_admin is not writable by clients.
  if has_column_privilege('authenticated', 'public.users', 'is_admin', 'update') then
    raise exception 'authenticated can update users.is_admin';
  end if;
  if has_column_privilege('authenticated', 'public.users', 'ics_token', 'update') then
    raise exception 'authenticated can overwrite users.ics_token (tokens are minted server-side)';
  end if;
end $$;
