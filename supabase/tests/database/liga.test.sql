-- Base de la liga (épica 7, historia 7.1). Se corre con `pnpm db:test`.
begin;
select plan(37);

-- La semana en curso (lunes, UTC), igual que la calcula la vista.
select set_config('test.week', (date_trunc('week', now() at time zone 'utc'))::date::text, true);

-- Cuatro estudiantes: A y C comparten cohorte con un bot, B está en otra y D no está en ninguna.
-- A también estuvo en una cohorte de la semana pasada.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@prueba.test'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@prueba.test'),
  ('00000000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@prueba.test'),
  ('00000000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@prueba.test');
update public.profiles set display_name = 'Carla' where id = '00000000-0000-4000-8000-00000000000c';

insert into public.league_cohorts (id, week_start)
values
  ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date),
  ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date),
  ('00000000-0000-4000-8000-0000000000d3', current_setting('test.week')::date - 7);
insert into public.league_members (cohort_id, week_start, user_id, bot_name, is_bot, weekly_xp)
values
  ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000a', null, false, 40),
  ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000c', null, false, 25),
  ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date, null, 'Robi', true, 60),
  ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000b', null, false, 10),
  ('00000000-0000-4000-8000-0000000000d3', current_setting('test.week')::date - 7, '00000000-0000-4000-8000-00000000000a', null, false, 99);

select columns_are('public', 'league_standings',
  array['cohort_id', 'week_start', 'display_name', 'weekly_xp', 'is_bot', 'is_me', 'rank'],
  'la vista expone solo esas columnas: ni correo ni user_id');

-- Estudiante A -------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

select is((select count(*)::int from public.league_standings), 3,
  'A ve las tres filas de su cohorte de esta semana');
select is((select display_name from public.league_standings where is_me), 'Estudiante',
  'su fila va marcada y un nombre nulo sale como «Estudiante»');
select is((select count(*)::int from public.league_standings where is_bot and display_name = 'Robi' and weekly_xp = 60),
  1, 'el bot sale con su nombre y marcado como bot');
select is((select count(*)::int from public.league_standings where display_name = 'Carla' and not is_bot and not is_me),
  1, 've el nombre visible de otra persona de su cohorte');
select is((select count(*)::int from public.league_standings where cohort_id = '00000000-0000-4000-8000-0000000000d2'),
  0, 'no ve la cohorte de B');
select is((select array_agg(display_name order by rank) from public.league_standings),
  array['Robi', 'Estudiante', 'Carla'], 'el servidor entrega el puesto por XP semanal');
select is((select count(*)::int from public.league_standings where week_start <> current_setting('test.week')::date),
  0, 'las cohortes de semanas pasadas no salen en la vista');

select throws_ok($$ select * from public.league_members $$, '42501', null, 'un estudiante no lee la tabla de miembros');
select throws_ok($$ select * from public.league_cohorts $$, '42501', null, 'un estudiante no lee la tabla de cohortes');
select throws_ok(
  $$ insert into public.league_members (cohort_id, week_start, user_id) values ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'un estudiante no inserta miembros');
select throws_ok($$ update public.league_members set weekly_xp = 9999 $$, '42501', null,
  'un estudiante no cambia su XP semanal');
select throws_ok($$ delete from public.league_members $$, '42501', null, 'un estudiante no borra miembros');
select throws_ok($$ insert into public.league_standings (cohort_id) values (gen_random_uuid()) $$, null::char(5), null::text,
  'un estudiante no inserta por la vista');
select throws_ok($$ update public.league_standings set weekly_xp = 9999 $$, null::char(5), null::text,
  'un estudiante no actualiza por la vista');
select throws_ok($$ delete from public.league_standings $$, null::char(5), null::text,
  'un estudiante no borra por la vista');
select table_privs_are('public', 'league_standings', 'authenticated', array['SELECT'],
  'la vista solo da lectura a un estudiante');
select is((select count(*)::int from public.profiles), 1, 'A sigue viendo solo su propio perfil');

-- Estudiante B -------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000b', true);

select is((select count(*)::int from public.league_standings where not is_me), 0,
  'B ve solo su cohorte, donde está solo');

-- Estudiante D, sin cohorte --------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000d', true);

select is((select count(*)::int from public.league_standings), 0, 'quien no está en una cohorte ve la vista vacía');

-- Sin sesión ---------------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select * from public.league_standings $$, '42501', null, 'sin sesión no se lee la liga');

-- Reglas de los datos --------------------------------------------------------------------------
reset role;

select throws_ok($$ insert into public.league_cohorts (week_start) values (current_setting('test.week')::date + 1) $$,
  '23514', null, 'una semana que no empieza en lunes se rechaza');
select throws_ok(
  $$ insert into public.league_members (cohort_id, week_start, user_id, bot_name, is_bot) values ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000d', 'Robi', true) $$,
  '23514', null, 'un bot no puede tener usuario');
select throws_ok(
  $$ insert into public.league_members (cohort_id, week_start, user_id, bot_name, is_bot) values ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date, null, null, false) $$,
  '23514', null, 'un miembro sin usuario tiene que ser un bot');
select throws_ok(
  $$ insert into public.league_members (cohort_id, week_start, user_id, bot_name, is_bot) values ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date, null, null, true) $$,
  '23514', null, 'un bot tiene que llevar nombre');
select throws_ok(
  $$ insert into public.league_members (cohort_id, week_start, user_id, bot_name, is_bot) values ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000d', 'Robi', false) $$,
  '23514', null, 'una persona no puede llevar nombre de bot');
select throws_ok(
  $$ insert into public.league_members (cohort_id, week_start, bot_name, is_bot, weekly_xp) values ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date, 'Robi', true, -1) $$,
  '23514', null, 'el XP semanal no puede ser negativo');
select throws_ok(
  $$ insert into public.league_members (cohort_id, week_start, bot_name, is_bot) values ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date, '', true) $$,
  '23514', null, 'el nombre de un bot no puede estar vacío');
select throws_ok(
  $$ insert into public.league_members (cohort_id, week_start, bot_name, is_bot) values ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date, repeat('x', 41), true) $$,
  '23514', null, 'el nombre de un bot no pasa de 40 caracteres');
select throws_ok(
  $$ insert into public.league_members (cohort_id, week_start, user_id) values ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000a') $$,
  '23505', null, 'una persona no está en dos cohortes la misma semana');
select throws_ok(
  $$ insert into public.league_members (cohort_id, week_start, user_id) values ('00000000-0000-4000-8000-0000000000d2', current_setting('test.week')::date + 7, '00000000-0000-4000-8000-00000000000d') $$,
  '23503', null, 'la semana del miembro tiene que ser la de su cohorte');
select lives_ok(
  $$ insert into public.league_members (cohort_id, week_start, user_id) values ('00000000-0000-4000-8000-0000000000d3', current_setting('test.week')::date - 7, '00000000-0000-4000-8000-00000000000d') $$,
  'una persona sí puede estar en cohortes de semanas distintas');

-- Borrar una cohorte o una cuenta ---------------------------------------------------------------
select lives_ok($$ delete from public.league_cohorts where id = '00000000-0000-4000-8000-0000000000d3' $$,
  'se puede borrar una cohorte vieja');
select is((select count(*)::int from public.league_members where cohort_id = '00000000-0000-4000-8000-0000000000d3'),
  0, 'borrar una cohorte se lleva a sus miembros');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
select lives_ok($$ select public.delete_my_account() $$, 'A borra su cuenta');
reset role;

select is((select count(*)::int from public.league_members where user_id = '00000000-0000-4000-8000-00000000000a'),
  0, 'borrar la cuenta quita su fila de la liga');
select is((select count(*)::int from public.league_members), 3, 'las filas de los demás y del bot siguen');

select * from finish();
rollback;
