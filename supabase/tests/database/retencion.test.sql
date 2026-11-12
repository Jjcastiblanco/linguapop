-- Retención de datos (épica 10, historia 10.2). Se corre con `pnpm db:test`.
begin;
select plan(29);

select set_config('test.week', (date_trunc('week', now() at time zone 'utc'))::date::text, true);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@prueba.test'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@prueba.test');

-- Cohortes: la actual, la del límite (8 semanas), una de 9 y otra de 12 semanas.
insert into public.league_cohorts (id, week_start)
values
  ('00000000-0000-4000-8000-0000000000c0', current_setting('test.week')::date),
  ('00000000-0000-4000-8000-0000000000c8', current_setting('test.week')::date - 56),
  ('00000000-0000-4000-8000-0000000000c9', current_setting('test.week')::date - 63),
  ('00000000-0000-4000-8000-0000000000cc', current_setting('test.week')::date - 84);
insert into public.league_members (cohort_id, week_start, user_id, bot_name, is_bot, weekly_xp)
values
  ('00000000-0000-4000-8000-0000000000c0', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000a', null, false, 40),
  ('00000000-0000-4000-8000-0000000000c0', current_setting('test.week')::date, null, 'Robi', true, 60),
  ('00000000-0000-4000-8000-0000000000c8', current_setting('test.week')::date - 56, '00000000-0000-4000-8000-00000000000b', null, false, 10),
  ('00000000-0000-4000-8000-0000000000c9', current_setting('test.week')::date - 63, '00000000-0000-4000-8000-00000000000a', null, false, 99),
  ('00000000-0000-4000-8000-0000000000c9', current_setting('test.week')::date - 63, null, 'Teo', true, 70),
  ('00000000-0000-4000-8000-0000000000cc', current_setting('test.week')::date - 84, '00000000-0000-4000-8000-00000000000b', null, false, 5);

-- Eventos de la persona A: el `received_at` lo pone el servidor, así que se envejece con un update.
create function public.zz_evento(i uuid, tipo text, payload jsonb) returns void
  language sql as $$
  insert into public.progress_events (id, type, payload, occurred_at, content_version)
  values (i, tipo, payload, now(), '1')
$$;
grant execute on function public.zz_evento(uuid, text, jsonb) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
select public.zz_evento('00000000-0000-4000-8000-0000000000e1', 'session_completed@1', '{"xp": 251}'); -- rechazado, viejo
select public.zz_evento('00000000-0000-4000-8000-0000000000e2', 'session_completed@1', '{"xp": 251}'); -- rechazado, reciente
select public.zz_evento('00000000-0000-4000-8000-0000000000e3', 'session_completed@1', '{"xp": 100}');  -- aceptado, viejo
select public.zz_evento('00000000-0000-4000-8000-0000000000e4', 'session_completed@1', '{"xp": 251}'); -- rechazado, dentro del plazo
reset role;

update public.progress_events set received_at = now() - interval '31 days' where id = '00000000-0000-4000-8000-0000000000e1';
update public.progress_events set received_at = now() - interval '2 days' where id = '00000000-0000-4000-8000-0000000000e2';
update public.progress_events set received_at = now() - interval '400 days' where id = '00000000-0000-4000-8000-0000000000e3';
update public.progress_events set received_at = now() - interval '29 days' where id = '00000000-0000-4000-8000-0000000000e4';

select is((select status from public.progress_events where id = '00000000-0000-4000-8000-0000000000e1'), 'rejected', 'preparado: el evento viejo está rechazado');
select is((select count(*)::int from public.progress_events where status = 'rejected' and id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e4')), 3, 'preparado: los tres eventos fuera de tope están rechazados');
select is((select status from public.progress_events where id = '00000000-0000-4000-8000-0000000000e3'), 'accepted', 'preparado: el evento aceptado está aceptado');

-- Permisos ----------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.purge_old_data()', 'execute'), 'authenticated no puede ejecutar la limpieza');
select ok(not has_function_privilege('anon', 'public.purge_old_data()', 'execute'), 'anon no puede ejecutar la limpieza');
select throws_ok(
  $$set local role authenticated; select public.purge_old_data()$$,
  '42501', null, 'un cliente que la llama recibe permiso denegado');
reset role;

-- Programación -------------------------------------------------------------------------------------
select is((select count(*)::int from cron.job where jobname = 'purge-old-data'), 1, 'hay un solo trabajo programado');
select is((select schedule from cron.job where jobname = 'purge-old-data'), '17 3 * * 1', 'corre los lunes a las 03:17 UTC');
select is((select command from cron.job where jobname = 'purge-old-data'), 'select public.purge_old_data()', 'el trabajo llama a la función');
select cron.schedule('purge-old-data', '17 3 * * 1', 'select public.purge_old_data()');
select is((select count(*)::int from cron.job where jobname = 'purge-old-data'), 1, 'programarlo otra vez no lo duplica');

select set_config('test.xp', (select weekly_xp::text from public.league_members where week_start = current_setting('test.week')::date and user_id = '00000000-0000-4000-8000-00000000000a'), true);

insert into realtime.messages (topic, extension, payload, event, private)
values ('league:reciente', 'broadcast', '{}', 'xp', true);

select set_config('test.avisos', (select count(*)::text from realtime.messages), true);

-- La limpieza ------------------------------------------------------------------------------------------
select public.purge_old_data();

select is((select count(*)::int from public.league_cohorts where id = '00000000-0000-4000-8000-0000000000c0'), 1, 'la cohorte actual se conserva');
select is((select count(*)::int from public.league_cohorts where id = '00000000-0000-4000-8000-0000000000c8'), 1, 'la cohorte de 8 semanas se conserva');
select is((select count(*)::int from public.league_cohorts where id in ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000cc')), 0, 'las cohortes de más de 8 semanas se borran');
select is((select count(*)::int from public.league_members where cohort_id in ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000cc')), 0, 'sus miembros (personas y bots) se borran con ellas');
select is((select count(*)::int from public.league_members where cohort_id in ('00000000-0000-4000-8000-0000000000c0', '00000000-0000-4000-8000-0000000000c8')), 3, 'los miembros de las cohortes conservadas siguen');
select is((select weekly_xp from public.league_members where week_start = current_setting('test.week')::date and user_id = '00000000-0000-4000-8000-00000000000a'), current_setting('test.xp')::int, 'el XP semanal vigente no cambia');
select is((select count(*)::int from public.progress_events where id = '00000000-0000-4000-8000-0000000000e1'), 0, 'el rechazado de más de 30 días se borra');
select is((select count(*)::int from public.progress_events where id in ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e4')), 2, 'los rechazados de menos de 30 días se conservan');
select is((select count(*)::int from public.progress_events where id = '00000000-0000-4000-8000-0000000000e3'), 1, 'un evento aceptado se conserva aunque sea muy viejo');

-- Borrar miembros de semanas pasadas no manda avisos; borrar uno de la semana en curso sí.
select is((select count(*)::int from realtime.messages), current_setting('test.avisos')::int, 'borrar miembros de semanas pasadas no manda avisos de Realtime');
delete from public.league_members where is_bot and week_start = current_setting('test.week')::date;
select is((select count(*)::int from realtime.messages), current_setting('test.avisos')::int, 'borrar un bot de la semana en curso no avisa');
update public.league_cohorts set notified_at = null;
delete from public.league_members where user_id = '00000000-0000-4000-8000-00000000000a' and week_start = current_setting('test.week')::date;
select is((select count(*)::int from realtime.messages), current_setting('test.avisos')::int + 1, 'borrar un miembro de la semana en curso sigue avisando a su cohorte');

-- Mensajes de Realtime: los reciente se conservan con el plazo normal y se borran con un plazo vencido.
select is((select count(*)::int from realtime.messages where topic = 'league:reciente'), 1, 'un mensaje de hoy se conserva con la limpieza normal');
select public.purge_realtime_messages(-1);
select is((select count(*)::int from realtime.messages where topic = 'league:reciente'), 0, 'y se borra cuando queda fuera del plazo');
select ok(not has_function_privilege('authenticated', 'public.purge_realtime_messages(integer)', 'execute'), 'ningún cliente ejecuta la limpieza de mensajes');

select ok(pg_get_functiondef('public.purge_old_data()'::regprocedure) ~ 'purge_realtime_messages\(realtime_days\)', 'la limpieza semanal llama a la de mensajes de Realtime');
select ok(pg_get_functiondef('public.purge_old_data()'::regprocedure) ~ 'realtime_days constant integer := 7;', 'con un plazo de 7 días');

-- Sin nada que borrar corre sin error y no cambia nada.
select lives_ok($$select public.purge_old_data()$$, 'una segunda corrida no falla');
select is((select count(*)::int from public.league_cohorts where id in ('00000000-0000-4000-8000-0000000000c0', '00000000-0000-4000-8000-0000000000c8')), 2, 'y deja lo mismo');

select * from finish();
rollback;
