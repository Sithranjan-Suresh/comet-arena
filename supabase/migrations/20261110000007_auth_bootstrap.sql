-- Task 15: restrict sign-ups to @utdallas.edu and bootstrap the public profile row.
-- Implemented as triggers on auth.users (works for Google OAuth and magic links alike).

create or replace function public.enforce_utd_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(new.email) !~ '^[^@\s]+@([a-z0-9-]+\.)*utdallas\.edu$' then
    raise exception 'Use your @utdallas.edu address to sign in.'
      using errcode = 'check_violation', hint = 'utd_email_required';
  end if;
  return new;
end $$;

drop trigger if exists enforce_utd_email on auth.users;
create trigger enforce_utd_email before insert on auth.users
  for each row execute function public.enforce_utd_email();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name',
             split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
