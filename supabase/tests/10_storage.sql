\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'alice@utdallas.edu'), ('00000000-0000-4000-8000-0000000000b2', 'bob@utdallas.edu');
insert into storage.objects (bucket_id, name) values ('flyers', 'submissions/00000000-0000-4000-8000-0000000000a1/seed.png');
insert into storage.objects (bucket_id, name) values ('private-docs', 'secret.pdf');

do $$
declare b record;
begin
  select * into b from storage.buckets where id = 'flyers';
  if not b.public then raise exception 'flyers bucket must be public'; end if;
  if b.file_size_limit <> 10485760 then raise exception 'size limit must be 10 MB'; end if;
  if b.allowed_mime_types <> array['image/jpeg','image/png'] then raise exception 'mime allow-list wrong'; end if;
end $$;

-- anon: can read flyers, cannot write, cannot see other buckets
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  if (select count(*) from storage.objects) <> 1 then raise exception 'anon should see exactly the flyers object'; end if;
  begin insert into storage.objects (bucket_id, name) values ('flyers', 'submissions/x/y.png'); raise exception 'anon must not upload';
  exception when insufficient_privilege or others then if sqlerrm = 'anon must not upload' then raise; end if; end;
end $$;
reset role;

-- alice: may upload into her own folder only; may not delete bob's or touch other buckets
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false);
do $$ begin
  insert into storage.objects (bucket_id, name) values ('flyers', 'submissions/00000000-0000-4000-8000-0000000000a1/new.png');
  begin insert into storage.objects (bucket_id, name) values ('flyers', 'submissions/00000000-0000-4000-8000-0000000000b2/evil.png');
    raise exception 'alice must not write into bob''s folder';
  exception when others then if sqlerrm like 'alice must not%' then raise; end if; end;
  begin insert into storage.objects (bucket_id, name) values ('flyers', 'elsewhere/x.png');
    raise exception 'alice must not write outside submissions/';
  exception when others then if sqlerrm like 'alice must not%' then raise; end if; end;
  begin insert into storage.objects (bucket_id, name) values ('private-docs', 'x.pdf');
    raise exception 'alice must not write other buckets';
  exception when others then if sqlerrm like 'alice must not%' then raise; end if; end;
end $$;
delete from storage.objects where name = 'submissions/00000000-0000-4000-8000-0000000000a1/new.png';  -- own file: ok
do $$ begin
  if exists (select 1 from storage.objects where name = 'submissions/00000000-0000-4000-8000-0000000000a1/new.png') then raise exception 'own delete failed'; end if;
end $$;
reset role;

-- bob cannot delete alice's file
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', false);
delete from storage.objects where name = 'submissions/00000000-0000-4000-8000-0000000000a1/seed.png';
reset role;
do $$ begin
  if not exists (select 1 from storage.objects where name = 'submissions/00000000-0000-4000-8000-0000000000a1/seed.png') then raise exception 'bob deleted alice''s file'; end if;
end $$;
delete from storage.objects;
delete from auth.users;
