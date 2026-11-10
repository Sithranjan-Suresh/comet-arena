-- Task 115: student confirmations (3 flips `unverified` to `live`) and problem flags.

-- One confirmation per student per competition, so the counter cannot be inflated.
create table public.competition_confirmations (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);
alter table public.competition_confirmations enable row level security;
grant select on public.competition_confirmations to authenticated;
create policy confirmations_select_own on public.competition_confirmations
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Three confirmations (from students or from reposts merged by ingestion) make a listing `live`.
create or replace function public.promote_on_confirmations() returns trigger
language plpgsql as $$
begin
  if new.confirmations >= 3 and new.status = 'unverified' then
    new.status := 'live';
  end if;
  return new;
end $$;
create trigger competitions_promote_on_confirmations
  before update of confirmations on public.competitions
  for each row execute function public.promote_on_confirmations();

-- "This looks right". Idempotent per student; you cannot confirm what you submitted yourself.
create or replace function public.confirm_competition(p_id uuid)
returns table (confirmations integer, status public.competition_status, already boolean)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_creator uuid; v_status public.competition_status; n int;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select c.created_by, c.status into v_creator, v_status from public.competitions c where c.id = p_id;
  if not found then raise exception 'competition not found' using errcode = 'P0002'; end if;
  if v_creator = v_user then raise exception 'cannot confirm your own submission' using errcode = '42501'; end if;
  if v_status in ('past', 'rejected') then raise exception 'competition is closed' using errcode = '22023'; end if;

  insert into public.competition_confirmations (competition_id, user_id) values (p_id, v_user)
    on conflict do nothing;
  get diagnostics n = row_count;
  if n = 1 then
    update public.competitions c set confirmations = c.confirmations + 1 where c.id = p_id;
  end if;
  return query select c.confirmations, c.status, (n = 0) from public.competitions c where c.id = p_id;
end $$;
revoke all on function public.confirm_competition(uuid) from public, anon;
grant execute on function public.confirm_competition(uuid) to authenticated;

-- Flags: what is wrong, from a fixed list, one open flag per student, field and competition.
alter table public.flags
  add constraint flags_field_check check (field in ('title', 'dates', 'link', 'prize', 'eligibility', 'cancelled', 'duplicate', 'other')),
  add constraint flags_note_len check (char_length(note) <= 500);
create unique index flags_one_open_per_user_field
  on public.flags (competition_id, user_id, field) where not resolved;
create index flags_open_idx on public.flags (created_at) where not resolved;
