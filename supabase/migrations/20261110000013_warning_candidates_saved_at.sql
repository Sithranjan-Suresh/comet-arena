-- Task 68: the warning job must not send "7 days left" to someone who saved the competition later than that.
-- Adds saved_at to the candidate rows.

drop function if exists public.stages_due_between(timestamptz, timestamptz);
create function public.stages_due_between(p_from timestamptz, p_to timestamptz)
returns table (
  stage_id uuid, stage_name text, deadline_at timestamptz, competition_id uuid, title text,
  slug text, register_url text, user_id uuid, email text, user_name text, saved_at timestamptz
) language sql stable as $$
  select s.id, s.name, s.deadline_at, c.id, c.title, c.slug, c.register_url, u.id, u.email, u.name, sv.created_at
  from public.stages s
  join public.competitions c on c.id = s.competition_id and c.status in ('live', 'unverified')
  join public.saves sv on sv.competition_id = c.id
  join public.users u on u.id = sv.user_id and u.email_warnings
  where s.deadline_at between p_from and p_to
    and not exists (select 1 from public.warning_mutes m where m.user_id = u.id and m.competition_id = c.id)
$$;
revoke all on function public.stages_due_between(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.stages_due_between(timestamptz, timestamptz) to service_role;
