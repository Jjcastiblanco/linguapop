-- Roles de contenido (épica 13, historia 13.8). Se corre con `pnpm db:test`.
begin;
select plan(46);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'estudiante@prueba.test'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'autor@prueba.test'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'publicador@prueba.test');
update public.profiles set role = 'author' where id = '00000000-0000-4000-8000-0000000000a2';
update public.profiles set role = 'publisher' where id = '00000000-0000-4000-8000-0000000000a3';

-- Parte de un contenido publicado conocido (todo se deshace al terminar).
delete from public.content_latest;
delete from public.content_snapshots;
insert into public.content_snapshots (id, schema_version, version, content, status, published_at)
values ('00000000-0000-4000-8000-0000000000c1', 1, 1,
  '{"schemaVersion": 1, "units": [{"id": "u-uno"}]}', 'published', now());
insert into public.content_latest (schema_version, snapshot_id)
values (1, '00000000-0000-4000-8000-0000000000c1');

-- Sin sesión ---------------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$ select public.save_content_draft(1, '{"schemaVersion": 1, "units": [{"id": "x"}]}') $$,
  '42501', null, 'sin sesión no se guarda un borrador');
select throws_ok(
  $$ select public.publish_content(1, 1, now()) $$, '42501', null, 'sin sesión no se publica');

-- Estudiante ---------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);

select throws_ok(
  $$ select public.save_content_draft(1, '{"schemaVersion": 1, "units": [{"id": "x"}]}') $$,
  '42501', 'solo autores y publicadores guardan borradores', 'un estudiante no guarda borradores');
select throws_ok(
  $$ select public.publish_content(1, 1, now()) $$,
  '42501', 'solo un publicador publica', 'un estudiante no publica');
select throws_ok(
  $$ select public.discard_content_draft(1) $$, '42501', null, 'un estudiante no descarta borradores');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('audio', '0123456789abcd.mp3') $$,
  '42501', null, 'un estudiante no sube audio');
select throws_ok(
  $$ insert into public.content_snapshots (schema_version, version, content) values (1, 9, '{}') $$,
  '42501', null, 'nadie escribe en la tabla de snapshots directamente');

-- Autor --------------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);

select is((select version from public.save_content_draft(1,
    '{"schemaVersion": 1, "units": [{"id": "u-dos"}]}')), 2,
  'el borrador nuevo toma la versión siguiente a la mayor');
select is((select count(*)::int from public.content_snapshots where status = 'draft'), 1,
  'el autor ve el borrador que guardó');
select is((select version from public.save_content_draft(1,
    '{"schemaVersion": 1, "units": [{"id": "u-tres"}]}')), 2,
  'guardar de nuevo reemplaza el borrador y conserva la versión');
select is((select count(*)::int from public.content_snapshots where status = 'draft'), 1,
  'sigue habiendo un solo borrador por versión de esquema');
select is((select content #>> '{units,0,id}' from public.content_snapshots where version = 2), 'u-tres',
  'el borrador tiene el contenido nuevo');
select is((select updated_by::text from public.content_snapshots where version = 2),
  '00000000-0000-4000-8000-0000000000a2', 'queda anotado quién lo guardó');

select throws_ok(
  $$ select public.save_content_draft(1, '{"schemaVersion": 2, "units": [{"id": "x"}]}') $$,
  '22023', null, 'la schemaVersion del contenido debe coincidir');
select throws_ok(
  $$ select public.save_content_draft(1, '{"schemaVersion": 1, "units": []}') $$,
  '22023', null, 'un curso sin unidades no se guarda');
select throws_ok(
  $$ select public.save_content_draft(1, '[1]') $$, '22023', null, 'el contenido debe ser un objeto');
select throws_ok(
  $$ select public.save_content_draft(1, null) $$, '22023', null, 'null no es contenido');
select throws_ok(
  $$ select public.save_content_draft(1, jsonb_build_object('schemaVersion', 1,
       'units', jsonb_build_array(jsonb_build_object('id', 'x')), 'relleno', repeat('x', 2200000))) $$,
  '22023', null, 'un contenido de más de 2 MiB no se guarda');
select is((select content #>> '{units,0,id}' from public.content_snapshots where version = 2), 'u-tres',
  'un guardado rechazado no toca el borrador');

select throws_ok(
  $$ select public.publish_content(1, 2, now()) $$,
  '42501', 'solo un publicador publica', 'un autor no publica');
select throws_ok(
  $$ update public.content_snapshots set status = 'published', published_at = now() where version = 2 $$,
  '42501', null, 'un autor no publica por la tabla');
select throws_ok(
  $$ update public.content_latest set snapshot_id = '00000000-0000-4000-8000-0000000000c1' $$,
  '42501', null, 'un autor no mueve el puntero latest');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('audio', '0123456789abcd.mp3') $$,
  'un autor sube audio');
select is((select count(*)::int from storage.objects where bucket_id = 'audio'), 1,
  'un autor ve el audio del bucket');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('otro', '0123456789abcd.mp3') $$,
  '42501', null, 'el autor solo sube al bucket de audio');
update storage.objects set name = 'ffffffffffffff.mp3' where bucket_id = 'audio';
select is((select count(*)::int from storage.objects where name = '0123456789abcd.mp3'), 1,
  'un autor no renombra el audio ya subido');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('audio', 'cualquier-cosa.mp3') $$,
  '42501', null, 'el nombre del audio debe ser una huella');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('audio', '../0123456789abcd.mp3') $$,
  '42501', null, 'el nombre del audio no admite rutas');
select throws_ok(
  $$ select public.save_content_draft(99999, '{"schemaVersion": 99999, "units": [{"id": "x"}]}') $$,
  '22023', null, 'no se guardan borradores de versiones de esquema inventadas');
select throws_ok(
  $$ select public.save_content_draft(1, '{"schemaVersion": 1, "units": [1]}') $$,
  '22023', null, 'cada unidad debe ser un objeto');
select throws_ok(
  $$ select public.save_content_draft(1, '{"schemaVersion": 1, "units": [{"nombre": "x"}]}') $$,
  '22023', null, 'cada unidad debe tener un id de texto');
select is((select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'audio%'
      and cmd in ('UPDATE', 'DELETE', 'ALL')), 0,
  'ninguna política de audio deja actualizar ni borrar desde un cliente');

select is(public.discard_content_draft(1), true, 'un autor descarta el borrador');
select is(public.discard_content_draft(1), false, 'descartar sin borrador devuelve falso');
select is((select count(*)::int from public.content_snapshots), 1, 'lo publicado sigue ahí');
select is((select version from public.save_content_draft(1,
    '{"schemaVersion": 1, "units": [{"id": "u-cuatro"}]}')), 2, 'tras descartar, el siguiente toma la misma versión');

-- Una sesión vigente sin perfil (cuenta borrada con el token aún válido) no es nadie ---------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000ff', true);
select throws_ok(
  $$ select public.save_content_draft(1, '{"schemaVersion": 1, "units": [{"id": "x"}]}') $$,
  '42501', null, 'sin perfil no se guarda un borrador');
select throws_ok(
  $$ select public.discard_content_draft(1) $$, '42501', null, 'sin perfil no se descarta un borrador');
select throws_ok(
  $$ select public.publish_content(1, 2, now()) $$, '42501', null, 'sin perfil no se publica');

-- Estudiante otra vez: no ve borradores --------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select is((select count(*)::int from public.content_snapshots), 1, 'un estudiante solo ve lo publicado');

-- Publicador ---------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);

select throws_ok(
  $$ select public.publish_content(1, 2, '2000-01-01'::timestamptz) $$,
  '40001', 'el borrador cambió desde que se revisó', 'no se publica un borrador que cambió tras revisarlo');
select throws_ok(
  $$ select public.publish_content(1, 7, now()) $$,
  'P0002', null, 'no se publica una versión que no es un borrador');
select is(public.publish_content(1, 2,
    (select updated_at from public.content_snapshots where version = 2 and status = 'draft')), 2,
  'un publicador publica el borrador revisado');
select is((select s.version from public.content_latest l join public.content_snapshots s on s.id = l.snapshot_id
    where l.schema_version = 1), 2, 'el puntero latest apunta a la versión nueva');
select is((select content #>> '{units,0,id}' from public.content_snapshots where version = 1), 'u-uno',
  'la versión anterior no cambió');
select throws_ok(
  $$ select public.publish_content(1, 2, now()) $$, 'P0002', null,
  'lo ya publicado no se publica otra vez (ni se modifica)');

select * from finish();
rollback;
