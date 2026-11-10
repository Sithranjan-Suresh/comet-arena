\set ON_ERROR_STOP on
begin;
insert into public.competitions (title) values ('AIS Case Competition');
insert into public.competitions (title) values ('AIS Case Competition');
insert into public.competitions (title) values ('AIS Case Competition');
do $$
declare n int; d int;
begin
  select count(distinct slug) into d from public.competitions where title = 'AIS Case Competition';
  if d <> 3 then raise exception 'expected 3 distinct slugs, got %', d; end if;
  if (select slug from public.competitions order by created_at limit 1) <> 'ais-case-competition' then
    raise exception 'first slug should be the bare slug';
  end if;
  if public.slugify('  Hack!!UTD 2026 ') <> 'hack-utd-2026' then raise exception 'slugify wrong'; end if;
  if public.slugify('!!!') <> 'competition' then raise exception 'empty slugify fallback wrong'; end if;
end $$;

-- updated_at advances on update
do $$
declare t1 timestamptz; t2 timestamptz; cid uuid;
begin
  select id, updated_at into cid, t1 from public.competitions limit 1;
  perform pg_sleep(0.01);
  update public.competitions set prize = '$1' where id = cid;
  select updated_at into t2 from public.competitions where id = cid;
  if t2 <= t1 then raise exception 'updated_at did not advance'; end if;
end $$;
rollback;
