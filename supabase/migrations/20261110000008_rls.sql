-- Task 16: Row-Level Security (spec §3). Default-deny, then grant exactly what each role needs.
-- Server code that must bypass RLS (ingestion, emails, API routes acting on behalf of the system)
-- uses the service_role key, which has BYPASSRLS.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.users where id = auth.uid()), false)
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- Start from nothing; grants below are the complete allow-list.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter table public.users enable row level security;
alter table public.orgs enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_sources enable row level security;
alter table public.stages enable row level security;
alter table public.eligibility enable row level security;
alter table public.saves enable row level security;
alter table public.warnings_sent enable row level security;
alter table public.free_agents enable row level security;
alter table public.team_openings enable row level security;
alter table public.entries enable row level security;
alter table public.flags enable row level security;
alter table public.email_subscribers enable row level security;
alter table public.ingest_posts enable row level security;
alter table public.submissions enable row level security;
alter table public.review_queue enable row level security;
alter table public.nebula_cache enable row level security;
alter table public.competition_changes enable row level security;

-- ---------- Public read: competitions graph + orgs ----------
grant select on public.competitions, public.competition_sources, public.stages,
  public.eligibility, public.orgs to anon, authenticated;

create policy competitions_public_read on public.competitions
  for select to anon, authenticated using (status <> 'rejected' or public.is_admin());
create policy sources_public_read on public.competition_sources
  for select to anon, authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_id and c.status <> 'rejected'));
create policy stages_public_read on public.stages
  for select to anon, authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_id and c.status <> 'rejected'));
create policy eligibility_public_read on public.eligibility
  for select to anon, authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_id and c.status <> 'rejected'));
create policy orgs_public_read on public.orgs for select to anon, authenticated using (true);

-- ---------- users: own row only; no self-promotion ----------
grant select on public.users to authenticated;
grant update (name, major, class_year, courses, interests, roles, email_warnings, digest, onboarded)
  on public.users to authenticated;
create policy users_select_own on public.users for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy users_update_own on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- saves ----------
grant select, insert, delete on public.saves to authenticated;
create policy saves_own on public.saves for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- entries: self-reported only; host verification/points are server-side ----------
grant select, insert, update, delete on public.entries to authenticated;
create policy entries_select_own on public.entries for select to authenticated
  using (user_id = auth.uid());
create policy entries_insert_own on public.entries for insert to authenticated
  with check (user_id = auth.uid() and verified_by_host = false and points is null);
create policy entries_update_own on public.entries for update to authenticated
  using (user_id = auth.uid() and verified_by_host = false)
  with check (user_id = auth.uid() and verified_by_host = false and points is null);
create policy entries_delete_own on public.entries for delete to authenticated
  using (user_id = auth.uid() and verified_by_host = false);

-- ---------- Free Agency: own rows in tables; public board via views ----------
grant select, insert, update, delete on public.free_agents, public.team_openings to authenticated;
create policy free_agents_own on public.free_agents for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy team_openings_own on public.team_openings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Views run with owner rights (they intentionally bypass the owner-only table policies).
-- Contact email is only populated for signed-in callers; anon sees NULL.
create view public.board_free_agents as
  select f.id, f.competition_id, f.roles, f.note, f.status, f.created_at,
         split_part(coalesce(u.name, 'Student'), ' ', 1) as display_name,
         case when auth.uid() is not null then u.email end as contact_email,
         (f.user_id = auth.uid()) as is_mine
  from public.free_agents f join public.users u on u.id = f.user_id
  where f.status = 'open';

create view public.board_team_openings as
  select t.id, t.competition_id, t.team_name, t.roles_needed, t.note, t.status, t.created_at,
         split_part(coalesce(u.name, 'Student'), ' ', 1) as display_name,
         case when auth.uid() is not null then u.email end as contact_email,
         (t.user_id = auth.uid()) as is_mine
  from public.team_openings t join public.users u on u.id = t.user_id
  where t.status = 'open';

grant select on public.board_free_agents, public.board_team_openings to anon, authenticated;

-- ---------- flags: signed-in users file, admins triage ----------
grant select, insert, update on public.flags to authenticated;
create policy flags_insert on public.flags for insert to authenticated with check (user_id = auth.uid());
create policy flags_select on public.flags for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy flags_admin_update on public.flags for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- submissions: users see/create their own; admins see all ----------
grant select, insert on public.submissions to authenticated;
create policy submissions_select on public.submissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy submissions_insert on public.submissions for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- ---------- admin-only ----------
grant select, update on public.review_queue to authenticated;
create policy review_queue_admin on public.review_queue for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.ingest_posts to authenticated;
create policy ingest_posts_admin on public.ingest_posts for select to authenticated
  using (public.is_admin());

-- warnings_sent, email_subscribers, nebula_cache, competition_changes: RLS on, no policies, no grants
-- => service_role only.
