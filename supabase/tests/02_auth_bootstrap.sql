\set ON_ERROR_STOP on
begin;
-- A UTD address creates a users row with an ics_token.
insert into auth.users (email, raw_user_meta_data) values ('Comet@UTDallas.edu', '{"full_name":"Comet Student"}');
do $$
declare u public.users;
begin
  select * into u from public.users where email = 'comet@utdallas.edu';
  if u.id is null then raise exception 'public.users row not created'; end if;
  if u.name <> 'Comet Student' then raise exception 'name not taken from metadata'; end if;
  if length(u.ics_token) < 32 then raise exception 'ics_token too short'; end if;
end $$;

-- Subdomains of utdallas.edu are allowed (e.g. student.utdallas.edu).
insert into auth.users (email) values ('x@student.utdallas.edu');

-- Anything else is rejected.
do $$
declare bad text;
begin
  foreach bad in array array['someone@gmail.com', 'x@utdallas.edu.evil.com', 'x@notutdallas.edu', 'x@evilutdallas.edu']
  loop
    begin
      insert into auth.users (email) values (bad);
      raise exception 'should have rejected %', bad;
    exception when check_violation then
      null; -- expected
    end;
  end loop;
end $$;
rollback;
