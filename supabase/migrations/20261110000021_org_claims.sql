-- Task 116: an officer asks to claim their organization; an admin approves; `orgs.claimed_by` is set.
create type public.claim_status as enum ('pending', 'approved', 'rejected');

create table public.org_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 300),
  status public.claim_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.users (id) on delete set null
);
-- One pending request per student per org.
create unique index org_claims_one_pending on public.org_claims (org_id, user_id) where status = 'pending';
create index org_claims_pending_idx on public.org_claims (created_at) where status = 'pending';

alter table public.org_claims enable row level security;
grant select, insert on public.org_claims to authenticated;
create policy org_claims_select on public.org_claims for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy org_claims_insert on public.org_claims for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and decided_at is null and decided_by is null);

-- Admin decision, called with the service role after the route has verified the caller is an admin.
-- Approving sets claimed_by and marks the org verified; the first approved claim wins.
create or replace function public.decide_org_claim(p_claim uuid, p_approve boolean, p_admin uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c public.org_claims; n int;
begin
  select * into c from public.org_claims where id = p_claim for update;
  if not found then return 'not_found'; end if;
  if c.status <> 'pending' then return 'already_decided'; end if;
  if p_approve then
    update public.orgs set claimed_by = c.user_id, verified = true where id = c.org_id and claimed_by is null;
    get diagnostics n = row_count;
    if n = 0 then return 'already_claimed'; end if;
  end if;
  update public.org_claims set status = case when p_approve then 'approved' else 'rejected' end::public.claim_status,
    decided_at = now(), decided_by = p_admin where id = p_claim;
  return case when p_approve then 'approved' else 'rejected' end;
end $$;
revoke all on function public.decide_org_claim(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.decide_org_claim(uuid, boolean, uuid) to service_role;
