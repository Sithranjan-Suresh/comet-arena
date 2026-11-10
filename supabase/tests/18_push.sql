\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000d1', 'a@utdallas.edu'), ('00000000-0000-4000-8000-0000000000d2', 'b@utdallas.edu');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false); end $$;

set role authenticated;
do $$
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-4000-8000-0000000000d1', 'https://push.example/a', repeat('p', 30), repeat('a', 12));
  begin insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-4000-8000-0000000000d1', 'http://push.example/insecure', repeat('p', 30), repeat('a', 12));
    raise exception 'insecure endpoint accepted'; exception when check_violation then null; end;
  begin insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-4000-8000-0000000000d2', 'https://push.example/b', repeat('p', 30), repeat('a', 12));
    raise exception 'subscribed as someone else'; exception when insufficient_privilege then null; end;
  begin insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-4000-8000-0000000000d1', 'https://push.example/a', repeat('p', 30), repeat('a', 12));
    raise exception 'duplicate endpoint accepted'; exception when unique_violation then null; end;
  begin insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-4000-8000-0000000000d1', 'https://push.example/c', 'short', 'x');
    raise exception 'short keys accepted'; exception when check_violation then null; end;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d2');
  if (select count(*) from public.push_subscriptions) <> 0 then raise exception 'another student sees a subscription'; end if;
  delete from public.push_subscriptions;  -- RLS: deletes nothing
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
  if (select count(*) from public.push_subscriptions) <> 1 then raise exception 'delete by another user removed the row'; end if;
  delete from public.push_subscriptions where endpoint = 'https://push.example/a';
  if (select count(*) from public.push_subscriptions) <> 0 then raise exception 'could not unsubscribe'; end if;
  begin perform 1 from public.outbound_notifications; raise exception 'student read the notification ledger'; exception when insufficient_privilege then null; end;
end $$;
reset role;
truncate public.push_subscriptions; delete from auth.users;
