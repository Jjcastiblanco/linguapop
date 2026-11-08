-- Cohortes semanales, bots y XP semanal (épica 7, historia 7.3). Se corre con `pnpm db:test`.
begin;
select plan(58);

-- La semana en curso (lunes, UTC), igual que la calcula el servidor.
select set_config('test.week', (date_trunc('week', now() at time zone 'utc'))::date::text, true);

-- 33 estudiantes: 00…01 a 00…21 (hex) y los de la prueba de XP.
insert into auth.users (id, instance_id, aud, role, email)
select format('00000000-0000-4000-8000-%s', lpad(to_hex(g), 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', format('u%s@prueba.test', g)
from generate_series(1, 34) as g;

create function public.zz_uid(n integer) returns uuid language sql as $$
  select format('00000000-0000-4000-8000-%s', lpad(to_hex(n), 12, '0'))::uuid
$$;
create function public.zz_evento(id uuid, tipo text, payload jsonb) returns void language sql as $$
  insert into public.progress_events (id, type, payload, occurred_at, content_version)
  values (id, tipo, payload, now(), '1')
$$;
grant execute on function public.zz_evento(uuid, text, jsonb) to authenticated;
create function public.zz_xp(n integer) returns integer language sql security definer as $$
  select weekly_xp from public.league_members
  where user_id = public.zz_uid(n) and week_start = current_setting('test.week')::date
$$;
create function public.zz_cohorte(n integer) returns uuid language sql security definer as $$
  select cohort_id from public.league_members
  where user_id = public.zz_uid(n) and week_start = current_setting('test.week')::date
$$;

-- Primera apertura -------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', public.zz_uid(1)::text, true);
select lives_ok($$ select public.open_league() $$, 'la persona abre la liga');
reset role;

select is((select count(*)::int from public.league_members where user_id = public.zz_uid(1)), 1,
  'queda en una sola cohorte');
select is((select count(*)::int from public.league_members where cohort_id = public.zz_cohorte(1)), 30,
  'la cohorte se completa hasta 30');
select is((select count(*)::int from public.league_members where cohort_id = public.zz_cohorte(1) and is_bot), 29,
  'con 29 bots');
select is((select count(distinct bot_name)::int from public.league_members where cohort_id = public.zz_cohorte(1) and is_bot), 29,
  'los bots llevan nombres distintos');
select is((select week_start from public.league_cohorts where id = public.zz_cohorte(1)), current_setting('test.week')::date,
  'la cohorte es de la semana UTC en curso');

set local role authenticated;
select set_config('request.jwt.claim.sub', public.zz_uid(1)::text, true);
select is((select count(*)::int from public.league_standings), 30, 'la vista le devuelve toda su cohorte');
select is((select count(*)::int from public.league_standings where is_me), 1, 'y su propia fila');
select is((select count(*)::int from public.league_standings where is_bot), 29, 'con los bots marcados');

-- Abrir de nuevo ----------------------------------------------------------------------------------
reset role;
select set_config('test.cohortes', (select count(*)::text from public.league_cohorts where week_start = current_setting('test.week')::date), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', public.zz_uid(1)::text, true);
select public.open_league();
reset role;
select is((select count(*)::int from public.league_members where user_id = public.zz_uid(1)), 1,
  'abrir de nuevo no duplica la fila');
select is((select count(*)::int from public.league_cohorts where week_start = current_setting('test.week')::date),
  current_setting('test.cohortes')::int, 'ni crea otra cohorte');
select is((select count(*)::int from public.league_members where cohort_id = public.zz_cohorte(1)), 30,
  'ni cambia el tamaño de la cohorte');

-- Segunda persona ---------------------------------------------------------------------------------
select public.league_open(public.zz_uid(2), now());
select is(public.zz_cohorte(2), public.zz_cohorte(1), 'la segunda persona entra a la misma cohorte');
select is((select count(*)::int from public.league_members where cohort_id = public.zz_cohorte(1)), 30,
  'la cohorte sigue en 30');
select is((select count(*)::int from public.league_members where cohort_id = public.zz_cohorte(1) and is_bot), 28,
  'un bot cedió su lugar');

-- Cohorte llena y cohorte nueva ----------------------------------------------------------------------
select lives_ok($$ select count(public.league_open(public.zz_uid(g), now())) from generate_series(3, 30) as g $$,
  'otras 28 personas abren la liga');
select is((select count(*)::int from public.league_members where cohort_id = public.zz_cohorte(1) and not is_bot), 30,
  'la primera cohorte llega a 30 personas');
select is((select count(*)::int from public.league_members where cohort_id = public.zz_cohorte(1) and is_bot), 0,
  'sin bots');

select public.league_open(public.zz_uid(31), now());
select isnt(public.zz_cohorte(31), public.zz_cohorte(1), 'la persona 31 va a una cohorte nueva');
select is((select count(*)::int from public.league_members where cohort_id = public.zz_cohorte(31)), 30,
  'que también se completa a 30');
select is((select count(*)::int from public.league_members where cohort_id = public.zz_cohorte(31) and is_bot), 29,
  'con 29 bots');
select is((select max(n)::int from (select count(*) n from public.league_members group by cohort_id) c), 30,
  'ninguna cohorte pasa de 30');

-- Bots deterministas ---------------------------------------------------------------------------------
select is(public.league_bot_target('semilla'), public.league_bot_target('semilla'), 'la misma semilla da el mismo objetivo');
select ok((select bool_and(public.league_bot_target('s' || g) between 100 and 1499) from generate_series(1, 500) as g),
  'el objetivo de un bot va de 100 a 1499');
select ok((select count(distinct public.league_bot_target('s' || g)) from generate_series(1, 500) as g) > 100,
  'y varía entre bots');
select is(public.league_bot_xp('semilla', current_setting('test.week')::date, current_setting('test.week')::date::timestamp at time zone 'utc'), 0,
  'el lunes a las 00:00 UTC un bot lleva 0');
select is(public.league_bot_xp('semilla', current_setting('test.week')::date, (current_setting('test.week')::date + 7)::timestamp at time zone 'utc'),
  public.league_bot_target('semilla'), 'al cerrar la semana llega a su objetivo');
select is(public.league_bot_xp('semilla', current_setting('test.week')::date, (current_setting('test.week')::date + 7)::timestamp at time zone 'utc' - interval '1 second'),
  public.league_bot_target('semilla') - 1,
  'un segundo antes de cerrar todavía no llega');

-- Los bots avanzan al abrir la liga y no retroceden ----------------------------------------------------------
select public.league_open(public.zz_uid(31), (current_setting('test.week')::date + 7)::timestamp at time zone 'utc' - interval '1 second');
select is((select count(*)::int from public.league_members m
  where m.cohort_id = public.zz_cohorte(31) and m.is_bot
    and m.weekly_xp <> public.league_bot_xp(m.cohort_id::text || m.week_start::text || m.bot_name, m.week_start,
      (current_setting('test.week')::date + 7)::timestamp at time zone 'utc' - interval '1 second')), 0,
  'los bots llevan el XP que toca a esa hora, calculado desde su semilla');
select ok((select bool_and(weekly_xp > 0) from public.league_members where cohort_id = public.zz_cohorte(31) and is_bot),
  'y a fin de semana todos llevan XP');
select set_config('test.botxp', (select sum(weekly_xp)::text from public.league_members where cohort_id = public.zz_cohorte(31) and is_bot), true);
select public.league_open(public.zz_uid(31), now());
select is((select sum(weekly_xp)::text from public.league_members where cohort_id = public.zz_cohorte(31) and is_bot),
  current_setting('test.botxp'), 'una apertura con hora anterior no baja el XP de los bots');

-- XP semanal de los eventos aceptados ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', public.zz_uid(1)::text, true);
select is(public.zz_xp(1), 0, 'quien acaba de entrar lleva 0');

select public.zz_evento('00000000-0000-4000-8000-0000000000a1', 'session_completed@1', '{"xp": 100}');
select is(public.zz_xp(1), 100, 'una sesión aceptada suma su xp');
select public.zz_evento('00000000-0000-4000-8000-0000000000a2', 'chest_opened@1', '{"xp": 20}');
select public.zz_evento('00000000-0000-4000-8000-0000000000a3', 'call_completed@1', '{"xp": 30}');
select is(public.zz_xp(1), 150, 'también suman la llamada y el cofre');
select public.zz_evento('00000000-0000-4000-8000-0000000000a4', 'session_completed@1', '{"xp": 251}');
select is(public.zz_xp(1), 150, 'un evento rechazado por el tope no suma');
select public.zz_evento('00000000-0000-4000-8000-0000000000a5', 'session_completed@1', '{"mode": "lesson"}');
select is(public.zz_xp(1), 150, 'un evento sin xp no suma');
select public.zz_evento('00000000-0000-4000-8000-0000000000a6', 'exercise_answered@1', '{"xp": 999}');
select is(public.zz_xp(1), 150, 'un evento de otro tipo no suma');
select public.zz_evento('00000000-0000-4000-8000-0000000000a7', 'legacy_imported@1', '{"xp": 50}');
select is(public.zz_xp(1), 150, 'la importación heredada no suma');
select public.zz_evento('00000000-0000-4000-8000-0000000000a8', 'session_completed@1', '{"xp": "20"}');
select is(public.zz_xp(1), 150, 'un xp que no es número no suma');
select lives_ok($$ insert into public.progress_events (id, type, payload, occurred_at, content_version)
  values ('00000000-0000-4000-8000-0000000000a1', 'session_completed@1', '{"xp": 100}', now(), '1') on conflict do nothing $$,
  'reenviar un evento ya guardado no falla');
select is(public.zz_xp(1), 150, 'y no suma otra vez');

-- XP anterior a abrir la liga --------------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', public.zz_uid(32)::text, true);
select public.zz_evento('00000000-0000-4000-8000-0000000000b1', 'session_completed@1', '{"xp": 100}');
select public.zz_evento('00000000-0000-4000-8000-0000000000b2', 'session_completed@1', '{"xp": 40}');
select public.zz_evento('00000000-0000-4000-8000-0000000000b3', 'session_completed@1', '{"xp": 999}');
reset role;
update public.progress_events set received_at = now() - interval '8 days' where id = '00000000-0000-4000-8000-0000000000b2';
select is((select count(*)::int from public.league_members where user_id = public.zz_uid(32)), 0,
  'quien no abrió la liga no tiene fila');
set local role authenticated;
select set_config('request.jwt.claim.sub', public.zz_uid(33)::text, true);
select public.zz_evento('00000000-0000-4000-8000-0000000000c1', 'exercise_answered@1', '{"xp": 900}');
select public.zz_evento('00000000-0000-4000-8000-0000000000c2', 'legacy_imported@1', '{"xp": 50}');
select public.zz_evento('00000000-0000-4000-8000-0000000000c3', 'session_completed@1', '{"mode": "lesson"}');
select public.zz_evento('00000000-0000-4000-8000-0000000000c4', 'session_completed@1', '{"xp": "20"}');
select public.zz_evento('00000000-0000-4000-8000-0000000000c5', 'session_completed@1', '{"xp": 10}');
reset role;
select public.league_open(public.zz_uid(33), now());
select is(public.zz_xp(33), 10, 'al asignar solo cuenta el xp válido de los tres tipos, no otros tipos, importación, sin xp ni texto');
-- Filas anteriores a 7.2 quedaron aceptadas sin tope: el XP anterior a abrir la liga se limita.
set local session_replication_role = replica;
insert into public.progress_events (id, user_id, type, payload, occurred_at, content_version, received_at)
values
  ('00000000-0000-4000-8000-0000000000c6', public.zz_uid(34), 'chest_opened@1', '{"xp": 999999999}', now(), '1', now()),
  ('00000000-0000-4000-8000-0000000000c7', public.zz_uid(34), 'chest_opened@1', '{"xp": 999999999}', now(), '1', now());
set local session_replication_role = origin;
select public.league_open(public.zz_uid(34), now());
select is(public.zz_xp(34), 21000, 'el XP anterior a abrir se limita al máximo semanal de 7.2 y no desborda');
select public.league_open(public.zz_uid(32), now());
select is(public.zz_xp(32), 100, 'al asignarlo entra el XP aceptado de esta semana, sin el de la semana pasada ni el rechazado');
set local role authenticated;
select set_config('request.jwt.claim.sub', public.zz_uid(32)::text, true);
select public.zz_evento('00000000-0000-4000-8000-0000000000b4', 'session_completed@1', '{"xp": 30}');
select is(public.zz_xp(32), 130, 'y los siguientes suman encima');
reset role;

-- Cambio de semana -----------------------------------------------------------------------------------------------
select public.league_open(public.zz_uid(1), (current_setting('test.week')::date + 7)::timestamp at time zone 'utc' - interval '1 second');
select is((select count(*)::int from public.league_members where user_id = public.zz_uid(1)), 1,
  'un segundo antes del lunes sigue en la misma semana');
select public.league_open(public.zz_uid(1), (current_setting('test.week')::date + 7)::timestamp at time zone 'utc');
select is((select count(*)::int from public.league_members where user_id = public.zz_uid(1)), 2,
  'el lunes 00:00 UTC tiene fila nueva');
select is((select weekly_xp from public.league_members where user_id = public.zz_uid(1) and week_start = current_setting('test.week')::date + 7), 0,
  'con el XP en 0');
select isnt((select cohort_id from public.league_members where user_id = public.zz_uid(1) and week_start = current_setting('test.week')::date + 7), public.zz_cohorte(1),
  'en una cohorte distinta');
select is(public.zz_xp(1), 150, 'el XP de la semana pasada se queda donde estaba');

-- Permisos -------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', public.zz_uid(1)::text, true);
select throws_ok($$ select public.league_open(public.zz_uid(5), now()) $$, '42501', null,
  'un estudiante no llama a la asignación interna');
select throws_ok($$ select public.league_bot_target('x') $$, '42501', null, 'ni a las funciones de los bots');
select throws_ok($$ select public.league_bot_xp('x', current_date, now()) $$, '42501', null, 'ni al XP de un bot');
select throws_ok($$ select public.league_week_start(now()) $$, '42501', null, 'ni al cálculo de la semana');
select ok(not has_function_privilege('authenticated', 'public.progress_events_league_xp()', 'execute'),
  'ni al disparador del XP semanal');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select public.open_league() $$, '28000', null, 'sin identidad no se abre la liga');
reset role;
set local role anon;
select throws_ok($$ select public.open_league() $$, '42501', null, 'sin sesión no se abre la liga');
reset role;

select * from finish();
rollback;
