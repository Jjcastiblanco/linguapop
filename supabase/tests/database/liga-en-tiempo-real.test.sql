-- La liga en tiempo real (épica 7, historia 7.5). Se corre con `pnpm db:test`; no necesita el
-- servidor Realtime: se prueba lo que escribe la base (avisos) y quién puede leerlo (la política).
begin;
select plan(44);

select set_config('test.week', (date_trunc('week', now() at time zone 'utc'))::date::text, true);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@prueba.test'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@prueba.test'),
  ('00000000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@prueba.test'),
  ('00000000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@prueba.test'),
  ('00000000-0000-4000-8000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e@prueba.test');

-- Cohorte 1: A y B con un bot. Cohorte 2: C. Cohorte de la semana pasada: D. E no está en ninguna.
insert into public.league_cohorts (id, week_start)
values
  ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date),
  ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date),
  ('00000000-0000-4000-8000-0000000000d3', current_setting('test.week')::date - 7);

create function public.zz_avisos(cohorte text) returns integer language sql security definer as $$
  select count(*)::int from realtime.messages where topic = 'league:' || cohorte
$$;

-- El aviso de una cohorte sale como mucho una vez por segundo (10.3): entre pasos se libera el intervalo.
create function public.zz_libre() returns void language sql security definer as $$
  update public.league_cohorts set notified_at = null
$$;

-- Qué se avisa -------------------------------------------------------------------------------
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 0, 'al empezar no hay avisos');

insert into public.league_members (cohort_id, week_start, user_id)
values ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000a');
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 1, 'entrar una persona a la cohorte avisa');

insert into public.league_members (cohort_id, week_start, bot_name, is_bot, weekly_xp)
values ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date, 'Robi', true, 5);
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 1, 'entrar un bot no avisa');

select public.zz_libre();
insert into public.league_members (cohort_id, week_start, user_id)
values
  ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000b'),
  ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000c'),
  ('00000000-0000-4000-8000-0000000000d3', current_setting('test.week')::date - 7, '00000000-0000-4000-8000-00000000000d');
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 2, 'cada cohorte recibe solo lo suyo (B en la 1)');
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d2'), 1, 'y C en la 2');

select public.zz_libre();
update public.league_members set weekly_xp = 40 where user_id = '00000000-0000-4000-8000-00000000000a';
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 3, 'cambiar el XP de una persona avisa');
update public.league_members set weekly_xp = 40 where user_id = '00000000-0000-4000-8000-00000000000a';
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 3, 'guardar el mismo XP no avisa');
update public.league_members set weekly_xp = 99 where is_bot;
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 3, 'avanzar un bot no avisa');
update public.league_members set created_at = now() where user_id = '00000000-0000-4000-8000-00000000000a';
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 3, 'cambiar otra columna no avisa');

-- Salir de la cohorte también avisa; un bot que se va, no
delete from public.league_members where is_bot;
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 3, 'borrar un bot no avisa');
select public.zz_libre();
delete from public.league_members where user_id = '00000000-0000-4000-8000-00000000000b';
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 4, 'salir una persona de la cohorte avisa');
select public.zz_libre();
insert into public.league_members (cohort_id, week_start, user_id)
values ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000b');
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 5, 'y al volver a entrar avisa otra vez');

-- Ráfagas: varios cambios dentro del segundo se funden en un aviso (10.3) ------------------------------
select public.zz_libre();
update public.league_members set weekly_xp = 100 where user_id = '00000000-0000-4000-8000-00000000000a';
update public.league_members set weekly_xp = 110 where user_id = '00000000-0000-4000-8000-00000000000a';
update public.league_members set weekly_xp = 120 where user_id = '00000000-0000-4000-8000-00000000000a';
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 6, 'tres cambios seguidos de una cohorte mandan un solo aviso');
select public.zz_libre();
update public.league_members set weekly_xp = 130 where user_id = '00000000-0000-4000-8000-00000000000a';
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 7, 'pasado el intervalo vuelve a avisar');
select public.zz_libre();
update public.league_members set weekly_xp = 140 where user_id = '00000000-0000-4000-8000-00000000000a';
update public.league_members set weekly_xp = 50 where user_id = '00000000-0000-4000-8000-00000000000c';
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 8, 'cada cohorte tiene su propio intervalo (la 1 avisa)');
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d2'), 2, 'y la 2 avisa también');
select ok((select notified_at from public.league_cohorts where id = '00000000-0000-4000-8000-0000000000d1') is not null, 'la cohorte guarda cuándo avisó');
select is((select notified_at from public.league_cohorts where id = '00000000-0000-4000-8000-0000000000d3'), null, 'una cohorte que no avisó no tiene marca');

-- Qué lleva el aviso --------------------------------------------------------------------------
select is((select count(*)::int from realtime.messages where topic like 'league:%' and (payload - 'id') <> '{}'::jsonb), 0,
  'el aviso no lleva más que su id: ni XP, ni nombres, ni correo, ni eventos');
select is((select count(distinct event || ':' || extension || ':' || private::text) from realtime.messages where topic like 'league:%'),
  1::bigint, 'todos son el mismo evento, de difusión y privados');
select is((select event from realtime.messages where topic like 'league:%' limit 1), 'xp', 'el evento se llama xp');

-- El camino real: un evento de XP de A avisa a su cohorte ----------------------------------------------
select public.zz_libre();
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
insert into public.progress_events (id, type, payload, occurred_at, content_version)
values ('00000000-0000-4000-8000-0000000000a1', 'session_completed@1', '{"xp": 20}', now(), '1');
reset role;
-- La semana de la prueba puede no ser la de `weekly_xp` si cruza el lunes: se mide el aviso nuevo.
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 9,
  'un evento de XP aceptado avisa a la cohorte de quien lo ganó');
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d2'), 2, 'y no a las demás');

-- Quién puede escuchar ---------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
select is(public.league_my_topic(), 'league:00000000-0000-4000-8000-0000000000d1', 'A tiene el canal de su cohorte');
select is((select count(*)::int from realtime.messages where topic = 'league:00000000-0000-4000-8000-0000000000d1'), 9,
  'A lee los avisos de su cohorte');
select is((select count(*)::int from realtime.messages where topic = 'league:00000000-0000-4000-8000-0000000000d2'), 0,
  'y ninguno de la cohorte de C');
select is((select count(*)::int from realtime.messages where topic not like 'league:%'), 0, 'ni de otros canales');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000c', true);
select is(public.league_my_topic(), 'league:00000000-0000-4000-8000-0000000000d2', 'C tiene el canal de la suya');
select is((select count(*)::int from realtime.messages where topic = 'league:00000000-0000-4000-8000-0000000000d1'), 0,
  'C no lee los avisos de la cohorte de A');
select is((select count(*)::int from realtime.messages where topic = 'league:00000000-0000-4000-8000-0000000000d2'), 2,
  'pero sí los de la suya');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000d', true);
select is(public.league_my_topic(), null, 'quien solo estuvo en una cohorte de la semana pasada no tiene canal');
select is((select count(*)::int from realtime.messages), 0, 'y no lee ningún aviso');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000e', true);
select is(public.league_my_topic(), null, 'quien no abrió la liga no tiene canal');
select is((select count(*)::int from realtime.messages), 0, 'y no lee ningún aviso');

-- Nadie difunde ni lee tablas -------------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
select throws_ok(
  $$ insert into realtime.messages (topic, extension, payload, event, private) values ('league:00000000-0000-4000-8000-0000000000d1', 'broadcast', '{"xp": 99999}', 'xp', true) $$,
  '42501', null, 'un estudiante no difunde mensajes al canal de su cohorte');
select throws_ok($$ select * from public.league_members $$, '42501', null, 'las tablas de la liga siguen cerradas');
-- `realtime.send` no lanza si falla, pero un estudiante tampoco consigue difundir con ella.
select lives_ok($$ select realtime.send('{"xp": 99999}'::jsonb, 'xp', 'league:00000000-0000-4000-8000-0000000000d1', true) $$,
  'llamar a realtime.send no rompe la sesión');
reset role;
select is(public.zz_avisos('00000000-0000-4000-8000-0000000000d1'), 9, 'pero no deja ningún aviso');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from realtime.messages), 0, 'sin sesión no se lee ningún aviso');
select throws_ok($$ select public.league_my_topic() $$, '42501', null, 'sin sesión no se pide el canal');
reset role;

-- Lo que Realtime publica y quién llama a los disparadores ----------------------------------------------------------
select is((select count(*)::int from pg_publication_tables
  where schemaname = 'public' and tablename in ('league_members', 'league_cohorts', 'progress_events', 'profiles')), 0,
  'ninguna tabla de la liga, de eventos o de perfiles se publica en Realtime');
select ok(not has_function_privilege('authenticated', 'public.league_members_notify()', 'execute'),
  'un estudiante no llama al disparador del aviso');
select ok(has_function_privilege('authenticated', 'public.league_my_topic()', 'execute'),
  'un estudiante sí pide su canal');
select ok(not has_function_privilege('anon', 'public.league_my_topic()', 'execute'), 'y quien no tiene sesión no');

select * from finish();
rollback;
