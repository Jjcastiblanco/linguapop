-- Tope de XP y límites de los eventos (épica 7, historia 7.2). Se corre con `pnpm db:test`.
begin;
select plan(28);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@prueba.test'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@prueba.test'),
  ('00000000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@prueba.test');

-- Cada evento se identifica por su id; esta función los inserta con la sesión de quien llama.
create function public.zz_evento(id uuid, tipo text, payload jsonb, version text default '1') returns void
  language sql as $$
  insert into public.progress_events (id, type, payload, occurred_at, content_version)
  values (id, tipo, payload, now(), version)
$$;
grant execute on function public.zz_evento(uuid, text, jsonb, text) to authenticated;
create function public.zz_estado(i uuid) returns text language sql as $$
  select status || coalesce(':' || rejection_reason, '') from public.progress_events where id = i
$$;
grant execute on function public.zz_estado(uuid) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

-- Dentro del tope ------------------------------------------------------------------------------
select public.zz_evento('00000000-0000-4000-8000-0000000000e1', 'session_completed@1', '{"xp": 100}');
select is(public.zz_estado('00000000-0000-4000-8000-0000000000e1'), 'accepted', 'un evento dentro del tope se acepta');

select public.zz_evento('00000000-0000-4000-8000-0000000000e2', 'session_completed@1', '{"xp": 250}');
select is(public.zz_estado('00000000-0000-4000-8000-0000000000e2'), 'accepted', 'el tope por evento es inclusivo');

select public.zz_evento('00000000-0000-4000-8000-0000000000e3', 'session_completed@1', '{"mode": "lesson"}');
select is(public.zz_estado('00000000-0000-4000-8000-0000000000e3'), 'accepted', 'un evento viejo sin xp se acepta');

select public.zz_evento('00000000-0000-4000-8000-0000000000e4', 'chest_opened@1', '{"xp": 20}');
select is(public.zz_estado('00000000-0000-4000-8000-0000000000e4'), 'accepted', 'un cofre dentro del tope se acepta');

select public.zz_evento('00000000-0000-4000-8000-0000000000e5', 'exercise_answered@1', '{"xp": 999999}');
select is(public.zz_estado('00000000-0000-4000-8000-0000000000e5'), 'accepted', 'solo los eventos que dan XP pasan por el tope');

-- Sobre el tope ----------------------------------------------------------------------------------
select public.zz_evento('00000000-0000-4000-8000-0000000000f1', 'session_completed@1', '{"xp": 251}');
select is(public.zz_estado('00000000-0000-4000-8000-0000000000f1'), 'rejected:xp_sobre_el_tope_del_evento',
  'una sesión sobre el tope por evento queda rechazada con su motivo');

select public.zz_evento('00000000-0000-4000-8000-0000000000f2', 'call_completed@1', '{"xp": 100000}');
select is(public.zz_estado('00000000-0000-4000-8000-0000000000f2'), 'rejected:xp_sobre_el_tope_del_evento',
  'una llamada sobre el tope queda rechazada');

select public.zz_evento('00000000-0000-4000-8000-0000000000f3', 'chest_opened@1', '{"xp": 9999}');
select is(public.zz_estado('00000000-0000-4000-8000-0000000000f3'), 'rejected:xp_sobre_el_tope_del_evento',
  'un cofre sobre el tope queda rechazado');

select public.zz_evento('00000000-0000-4000-8000-0000000000f4', 'session_completed@1', '{"xp": "100"}');
select public.zz_evento('00000000-0000-4000-8000-0000000000f5', 'session_completed@1', '{"xp": 1.5}');
select public.zz_evento('00000000-0000-4000-8000-0000000000f6', 'session_completed@1', '{"xp": -5}');
select public.zz_evento('00000000-0000-4000-8000-0000000000f7', 'session_completed@1', '{"xp": 1000000000}');
select public.zz_evento('00000000-0000-4000-8000-0000000000f8', 'session_completed@1', '{"xp": null}');
select is((select count(*)::int from public.progress_events where rejection_reason = 'xp_invalido'), 5,
  'un xp en texto, decimal, negativo, de más de 9 dígitos o nulo es inválido y se rechaza');

-- Un cliente que fije el estado no lo consigue.
insert into public.progress_events (id, type, payload, occurred_at, content_version, status, rejection_reason)
values ('00000000-0000-4000-8000-0000000000f9', 'session_completed@1', '{"xp": 9999}', now(), '1', 'accepted', null);
select is(public.zz_estado('00000000-0000-4000-8000-0000000000f9'), 'rejected:xp_sobre_el_tope_del_evento',
  'el servidor pisa el estado que mande el cliente');
insert into public.progress_events (id, type, payload, occurred_at, content_version, status, rejection_reason)
values ('00000000-0000-4000-8000-0000000000fa', 'session_completed@1', '{"xp": 10}', now(), '1', 'rejected', 'a mano');
select is(public.zz_estado('00000000-0000-4000-8000-0000000000fa'), 'accepted',
  'tampoco puede marcarse como rechazado un evento válido ni escribir un motivo');

-- Tope del día -----------------------------------------------------------------------------------
-- Hasta aquí el día lleva 100 + 250 + 20 + 10 = 380 de XP aceptado; 10 sesiones de 250 llegan a 2880.
do $$
begin
  for i in 1..10 loop
    perform public.zz_evento(('00000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid,
      'session_completed@1', '{"xp": 250}');
  end loop;
end;
$$;
select is((select count(*)::int from public.progress_events where id::text like '00000000-0000-4000-8000-0000000001%' and status = 'accepted'),
  10, 'las sesiones que caben en el día se aceptan');
select public.zz_evento('00000000-0000-4000-8000-0000000002a1', 'session_completed@1', '{"xp": 120}');
select is(public.zz_estado('00000000-0000-4000-8000-0000000002a1'), 'accepted', 'llega justo al tope del día (3000)');
select public.zz_evento('00000000-0000-4000-8000-0000000002a2', 'session_completed@1', '{"xp": 1}');
select is(public.zz_estado('00000000-0000-4000-8000-0000000002a2'), 'rejected:xp_sobre_el_tope_del_dia',
  'un punto más del tope del día se rechaza');

-- Las reglas de B no dependen de lo de A.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000b', true);
select public.zz_evento('00000000-0000-4000-8000-0000000003b1', 'session_completed@1', '{"xp": 250}');
select is(public.zz_estado('00000000-0000-4000-8000-0000000003b1'), 'accepted', 'el tope del día es por persona');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

-- Reenviar el mismo id no cambia el evento guardado.
insert into public.progress_events (id, type, payload, occurred_at, content_version)
values ('00000000-0000-4000-8000-0000000000e1', 'session_completed@1', '{"xp": 9999}', now(), '1')
on conflict (id) do nothing;
select is(public.zz_estado('00000000-0000-4000-8000-0000000000e1'), 'accepted', 'reenviar un id no cambia su estado');
select is((select payload ->> 'xp' from public.progress_events where id = '00000000-0000-4000-8000-0000000000e1'),
  '100', 'ni su contenido');

-- Tamaños y cantidades -------------------------------------------------------------------------
select throws_ok(
  $$ select public.zz_evento('00000000-0000-4000-8000-0000000004c1', 'exercise_answered@1', jsonb_build_object('pad', repeat('x', 9000))) $$,
  '23514', null, 'un payload de más de 8 KB se rechaza');
select lives_ok(
  $$ select public.zz_evento('00000000-0000-4000-8000-0000000004c2', 'legacy_imported@1', jsonb_build_object('pad', repeat('x', 20000))) $$,
  'la importación heredada admite un payload mayor');
select throws_ok(
  $$ select public.zz_evento('00000000-0000-4000-8000-0000000004c3', 'legacy_imported@1', jsonb_build_object('pad', repeat('x', 70000))) $$,
  '23514', null, 'pero no uno de más de 64 KB');
select throws_ok(
  $$ select public.zz_evento('00000000-0000-4000-8000-0000000004c4', 'exercise_answered@1', '{}', repeat('9', 21)) $$,
  '23514', null, 'una versión de contenido de más de 20 caracteres se rechaza');

-- Con 5 000 eventos de hoy ya no entra ninguno más (se llenan sin disparadores).
reset role;
alter table public.progress_events disable trigger user;
insert into public.progress_events (id, user_id, type, payload, occurred_at, content_version)
select gen_random_uuid(), '00000000-0000-4000-8000-00000000000b', 'exercise_answered@1', '{}', now(), '1'
from generate_series(1, 4999);
insert into public.progress_events (id, user_id, type, payload, occurred_at, content_version)
values ('00000000-0000-4000-8000-0000000005d0', '00000000-0000-4000-8000-00000000000b', 'exercise_answered@1', '{}', now(), '1');
alter table public.progress_events enable trigger user;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000b', true);
select throws_ok(
  $$ select public.zz_evento('00000000-0000-4000-8000-0000000005d1', 'exercise_answered@1', '{}') $$,
  'PT429', null, 'con 5 000 eventos hoy no entra otro, con un error que el cliente reintenta');
select lives_ok(
  $$ insert into public.progress_events (id, type, payload, occurred_at, content_version)
     values ('00000000-0000-4000-8000-0000000005d0', 'exercise_answered@1', '{}', now(), '1')
     on conflict (id) do nothing $$,
  'reenviar un evento ya guardado no falla aunque el día esté lleno');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
select lives_ok(
  $$ select public.zz_evento('00000000-0000-4000-8000-0000000005d2', 'exercise_answered@1', '{}') $$,
  'el límite es por persona');

-- Una sola importación heredada por cuenta (C aún no hizo ninguna) --------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000c', true);
select lives_ok(
  $$ select public.zz_evento('00000000-0000-4000-8000-0000000006e1', 'legacy_imported@1', '{"xp": 1}') $$,
  'la primera importación heredada se acepta');
select throws_ok(
  $$ select public.zz_evento('00000000-0000-4000-8000-0000000006e2', 'legacy_imported@1', '{"xp": 1}') $$,
  '23514', null, 'una segunda importación heredada con otro id se rechaza');
select lives_ok(
  $$ insert into public.progress_events (id, type, payload, occurred_at, content_version)
     values ('00000000-0000-4000-8000-0000000006e1', 'legacy_imported@1', '{"xp": 1}', now(), '1')
     on conflict (id) do nothing $$,
  'reenviar la misma importación es inocuo');

-- Varias filas en una sola sentencia respetan el tope del día ------------------------------------
insert into public.progress_events (id, type, payload, occurred_at, content_version)
select gen_random_uuid(), 'session_completed@1', '{"xp": 250}', now(), '1' from generate_series(1, 14);
select is((select sum((payload ->> 'xp')::int)::int from public.progress_events where status = 'accepted' and type = 'session_completed@1'),
  3000, 'catorce sesiones en una sola sentencia suman 3000 aceptadas, no 3500');

select * from finish();
rollback;
