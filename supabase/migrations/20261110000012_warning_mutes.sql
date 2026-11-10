-- Task 67: per-competition warning opt-out that keeps the competition saved and on the calendar.

create table public.warning_mutes (
  user_id uuid not null references public.users (id) on delete cascade,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, competition_id)
);

alter table public.warning_mutes enable row level security;
revoke all on public.warning_mutes from anon, authenticated;
grant select, delete on public.warning_mutes to authenticated; -- users can see and undo their own mutes
create policy warning_mutes_own on public.warning_mutes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Inserts happen through the signed-token endpoint (service role).

-- Warning candidates now exclude muted competitions.
create or replace function public.stages_due_between(p_from timestamptz, p_to timestamptz)
returns table (
  stage_id uuid, stage_name text, deadline_at timestamptz, competition_id uuid, title text,
  slug text, register_url text, user_id uuid, email text, user_name text
) language sql stable as $$
  select s.id, s.name, s.deadline_at, c.id, c.title, c.slug, c.register_url, u.id, u.email, u.name
  from public.stages s
  join public.competitions c on c.id = s.competition_id and c.status in ('live', 'unverified')
  join public.saves sv on sv.competition_id = c.id
  join public.users u on u.id = sv.user_id and u.email_warnings
  where s.deadline_at between p_from and p_to
    and not exists (select 1 from public.warning_mutes m where m.user_id = u.id and m.competition_id = c.id)
$$;
revoke all on function public.stages_due_between(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.stages_due_between(timestamptz, timestamptz) to service_role;
