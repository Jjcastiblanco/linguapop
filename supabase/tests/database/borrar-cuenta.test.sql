-- Borrar la cuenta (épica 5, historia 5.8). Se corre con `pnpm db:test`.
begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@prueba.test'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@prueba.test');

-- Cada cuenta guarda un evento con su sesión (el servidor pone el user_id).
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
insert into public.progress_events (id, type, payload, occurred_at, content_version)
values ('00000000-0000-4000-8000-0000000000e1', 'purchase@1', '{}', now(), '0');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000b', true);
insert into public.progress_events (id, type, payload, occurred_at, content_version)
values ('00000000-0000-4000-8000-0000000000e2', 'purchase@1', '{}', now(), '0');
reset role;

-- Sin sesión no se puede -----------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'sin sesión no puede ejecutarla');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select public.delete_my_account() $$, '28000', null, 'con una sesión vacía tampoco');

-- A borra su cuenta -----------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
select lives_ok($$ select public.delete_my_account() $$, 'A borra su cuenta');

reset role;
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-00000000000a'), 0, 'ya no existe el usuario A');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-00000000000a'), 0, 'ya no existe el perfil de A');
select is((select count(*)::int from public.progress_events where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'ya no existen los eventos de A');

-- B sigue intacto --------------------------------------------------------------------------------
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-00000000000b'), 1, 'el usuario B sigue existiendo');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-00000000000b'), 1, 'el perfil de B sigue');
select is((select count(*)::int from public.progress_events where user_id = '00000000-0000-4000-8000-00000000000b'), 1, 'los eventos de B siguen');

select * from finish();
rollback;
