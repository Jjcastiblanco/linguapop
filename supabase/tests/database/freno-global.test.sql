-- Freno global de eventos (épica 11, historia 11.1). Se corre con `pnpm db:test`.
begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@prueba.test'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@prueba.test');

create function public.zz_evento(i uuid, tipo text, payload jsonb) returns void
  language sql as $$
  insert into public.progress_events (id, type, payload, occurred_at, content_version)
  values (i, tipo, payload, now(), '1')
  on conflict (id) do nothing
$$;
grant execute on function public.zz_evento(uuid, text, jsonb) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

-- Bajo el freno (el límite se sube para no depender del peso real de la tabla)
select set_config('linguapop.max_events_bytes', '1000000000', true);
select lives_ok($$ select public.zz_evento('00000000-0000-4000-8000-0000000000e1', 'purchase@1', '{}') $$,
  'con la tabla por debajo del límite el evento nuevo se guarda');

-- En el freno (un límite de 1 byte queda siempre por debajo del peso de la tabla)
select set_config('linguapop.max_events_bytes', '1', true);
select throws_ok($$ select public.zz_evento('00000000-0000-4000-8000-0000000000e2', 'purchase@1', '{}') $$,
  'PT429', 'la base está llena, reintenta más tarde', 'con la tabla en el límite el evento nuevo falla con PT429');
select throws_ok($$ select public.zz_evento('00000000-0000-4000-8000-0000000000e3', 'legacy_imported@1', '{}') $$,
  'PT429', 'la base está llena, reintenta más tarde', 'también el evento heredado');
select is((select count(*)::int from public.progress_events), 1, 'los eventos fallidos no se guardan');

-- Reenviar un id ya guardado no falla ni duplica
select lives_ok($$ select public.zz_evento('00000000-0000-4000-8000-0000000000e1', 'purchase@1', '{}') $$,
  'reenviar un id ya guardado con la tabla en el límite no falla');
select is((select count(*)::int from public.progress_events), 1, 'ni duplica');

-- La lectura no se ve afectada
select is((select type from public.progress_events where id = '00000000-0000-4000-8000-0000000000e1'), 'purchase@1',
  'la lectura sigue funcionando');

-- El freno es global: otra cuenta también falla
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000b', true);
select throws_ok($$ select public.zz_evento('00000000-0000-4000-8000-0000000000f1', 'purchase@1', '{}') $$,
  'PT429', null, 'otra cuenta también recibe PT429');

-- Al liberar espacio (límite alto de nuevo) los eventos vuelven a guardarse
select set_config('linguapop.max_events_bytes', '1000000000', true);
select lives_ok($$ select public.zz_evento('00000000-0000-4000-8000-0000000000f2', 'purchase@1', '{}') $$,
  'con la tabla otra vez por debajo del límite la cuenta guarda');
select is((select count(*)::int from public.progress_events), 1, 'y ve solo lo suyo');

select * from finish();
rollback;
