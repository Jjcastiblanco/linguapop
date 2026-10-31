-- Permisos por fila del esquema inicial (épica 5, historia 5.1). Se corre con `pnpm db:test`.
begin;
select plan(18);

-- Dos estudiantes (el disparador crea sus perfiles) y un snapshot publicado y otro borrador.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@prueba.test'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@prueba.test');

-- La migración de la semilla ya publicó el snapshot 1; la prueba parte de contenido vacío (todo se deshace al terminar).
delete from public.content_latest;
delete from public.content_snapshots;

insert into public.content_snapshots (id, schema_version, version, content, status, published_at)
values
  ('00000000-0000-4000-8000-0000000000c1', 1, 1, '{"units": []}', 'published', now()),
  ('00000000-0000-4000-8000-0000000000c2', 1, 2, '{"units": []}', 'draft', null);
insert into public.content_latest (schema_version, snapshot_id)
values (1, '00000000-0000-4000-8000-0000000000c1');

select is((select count(*)::int from public.profiles), 2, 'cada cuenta nueva tiene su perfil');
select is((select role::text from public.profiles where id = '00000000-0000-4000-8000-00000000000a'),
  'student', 'el perfil nace con el rol de estudiante');

-- Estudiante A -------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

insert into public.progress_events (id, user_id, type, payload, occurred_at, content_version)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000000b',
  'session_completed@1', '{"xp": 10, "user_id": "00000000-0000-4000-8000-00000000000b"}', now(), '1');

select is((select user_id::text from public.progress_events where id = '00000000-0000-4000-8000-0000000000e1'),
  '00000000-0000-4000-8000-00000000000a', 'el usuario del evento sale de la sesión, no de lo enviado');
select is((select payload ? 'user_id' from public.progress_events where id = '00000000-0000-4000-8000-0000000000e1'),
  false, 'el user_id del payload se descarta');
select is((select payload ->> 'xp' from public.progress_events where id = '00000000-0000-4000-8000-0000000000e1'),
  '10', 'el resto del payload se conserva');

insert into public.progress_events (id, user_id, type, payload, occurred_at, content_version)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000000a',
  'session_completed@1', '{"xp": 999}', now(), '1')
on conflict (id) do nothing;
select is((select count(*)::int from public.progress_events), 1, 'reenviar el mismo id no duplica el evento');
select is((select payload ->> 'xp' from public.progress_events), '10', 'el reenvío no pisa el evento guardado');

select throws_ok(
  $$ update public.progress_events set payload = '{}' $$, '42501', null,
  'un cliente no puede actualizar eventos');
select throws_ok(
  $$ delete from public.progress_events $$, '42501', null,
  'un cliente no puede borrar eventos');
select throws_ok(
  $$ update public.profiles set role = 'publisher' $$, '42501', null,
  'un estudiante no puede cambiar su propio rol');
select lives_ok(
  $$ update public.profiles set display_name = 'Ana' $$,
  'un estudiante sí puede cambiar su nombre visible');

-- Estudiante B -------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000b', true);

select is((select count(*)::int from public.progress_events), 0, 'B no ve los eventos de A');
select is((select count(*)::int from public.profiles), 1, 'B solo ve su propio perfil');

insert into public.progress_events (id, user_id, type, payload, occurred_at, content_version)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000000b',
  'session_completed@1', '{"xp": 1}', now(), '1')
on conflict (id) do nothing;
select is((select count(*)::int from public.progress_events), 0, 'B no puede tomar el id de un evento de A');

select is((select count(*)::int from public.content_snapshots), 1, 'B lee solo los snapshots publicados');

select throws_ok(
  $$ insert into public.content_snapshots (schema_version, version, content) values (1, 3, '{}') $$,
  '42501', null, 'un estudiante no escribe contenido');

-- Sin sesión ---------------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is((select count(*)::int from public.content_latest), 1, 'sin sesión se lee el puntero latest publicado');
select throws_ok(
  $$ insert into public.progress_events (id, type, payload, occurred_at, content_version)
     values ('00000000-0000-4000-8000-0000000000e9', 'x@1', '{}', now(), '1') $$,
  '42501', null, 'sin sesión no se escriben eventos');

select * from finish();
rollback;
