-- Tope de eventos almacenados por cuenta (épica 10, historia 10.7). Se corre con `pnpm db:test`.
begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@prueba.test'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@prueba.test');

-- La cuenta A ya guarda 19 999 eventos de hace dos días (para no tocar el tope diario): 999 rechazados y el resto
-- aceptados. Se insertan como superusuario sin disparadores: son solo relleno.
set local session_replication_role = replica;
insert into public.progress_events (id, user_id, type, payload, occurred_at, content_version, received_at, status)
select gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', 'purchase@1', '{}', now() - interval '2 days', '1',
  now() - interval '2 days', case when g <= 999 then 'rejected' else 'accepted' end
from generate_series(1, 19999) g;
set local session_replication_role = origin;

create function public.zz_evento(i uuid, tipo text, payload jsonb) returns void
  language sql as $$
  insert into public.progress_events (id, type, payload, occurred_at, content_version)
  values (i, tipo, payload, now(), '1')
  on conflict (id) do nothing
$$;
grant execute on function public.zz_evento(uuid, text, jsonb) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

-- Bajo el tope
select lives_ok($$ select public.zz_evento('00000000-0000-4000-8000-0000000000e1', 'purchase@1', '{}') $$,
  'con 19 999 eventos guardados (aceptados y rechazados) el siguiente se guarda');
select is((select count(*)::int from public.progress_events), 20000, 'y la cuenta queda en 20 000');

-- En el tope
select throws_ok($$ select public.zz_evento('00000000-0000-4000-8000-0000000000e2', 'purchase@1', '{}') $$,
  'PT429', 'demasiados eventos guardados', 'con 20 000 el evento nuevo falla con PT429 (reintentable)');
select throws_ok($$ select public.zz_evento('00000000-0000-4000-8000-0000000000e3', 'legacy_imported@1', '{}') $$,
  'PT429', 'demasiados eventos guardados', 'también el evento heredado');
select is((select count(*)::int from public.progress_events where id in ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e3')), 0,
  'y los fallidos no se guardan');

-- Reenviar un evento ya guardado no falla ni duplica
select lives_ok($$ select public.zz_evento('00000000-0000-4000-8000-0000000000e1', 'purchase@1', '{}') $$,
  'reenviar un id ya guardado con la cuenta en el tope no falla');
select is((select count(*)::int from public.progress_events), 20000, 'ni duplica');

-- El error es el mismo que el del tope diario (reintentable), no uno definitivo
select throws_ok($$ select public.zz_evento('00000000-0000-4000-8000-0000000000e4', 'exercise_answered@1', '{}') $$,
  'PT429', null, 'un evento de otro tipo falla igual');

-- Otra cuenta no se ve afectada
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000b', true);
select lives_ok($$ select public.zz_evento('00000000-0000-4000-8000-0000000000f1', 'purchase@1', '{}') $$, 'otra cuenta sigue guardando');
select is((select count(*)::int from public.progress_events), 1, 'y solo ve lo suyo');

select * from finish();
rollback;
