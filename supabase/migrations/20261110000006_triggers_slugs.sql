-- Task 14: updated_at maintenance + unique slug generation.

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create trigger competitions_touch before update on public.competitions
  for each row execute function public.touch_updated_at();
create trigger orgs_touch before update on public.orgs
  for each row execute function public.touch_updated_at();
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

-- Lowercase, ascii-ish, hyphen-separated; never empty.
create or replace function public.slugify(input text) returns text
language sql immutable as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g')), ''),
    'competition')
$$;

-- Unique competition slug: base, then base-yyyy-mm, then base-yyyy-mm-N.
create or replace function public.unique_competition_slug(p_title text, p_when timestamptz default now())
returns text language plpgsql as $$
declare
  base text := left(public.slugify(p_title), 80);
  candidate text := base;
  n int := 1;
begin
  if not exists (select 1 from public.competitions where slug = candidate) then return candidate; end if;
  candidate := base || '-' || to_char(p_when at time zone 'America/Chicago', 'YYYY-MM');
  while exists (select 1 from public.competitions where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || to_char(p_when at time zone 'America/Chicago', 'YYYY-MM') || '-' || n;
  end loop;
  return candidate;
end $$;

-- Auto-assign a slug on insert when none is given (BEFORE triggers run before NOT NULL checks).
create or replace function public.competitions_default_slug() returns trigger
language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.unique_competition_slug(new.title, coalesce(new.created_at, now()));
  end if;
  return new;
end $$;

create trigger competitions_slug before insert on public.competitions
  for each row execute function public.competitions_default_slug();
