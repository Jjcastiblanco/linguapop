-- Quién escribe y quién publica el contenido (épica 13, historia 13.8). El rol de la cuenta
-- (`profiles.role`) decide, no una clave de servicio: un autor guarda borradores y sube audio, solo
-- un publicador publica, un estudiante no escribe nada. Ningún cliente tiene permiso de escritura
-- sobre las tablas: todo pasa por estas funciones, que corren con los permisos de su dueño y
-- comprueban el rol de la sesión. Lo publicado nunca se modifica: `publish_content` solo convierte
-- un borrador en publicado y mueve el puntero `latest`.
--
-- El rol no lo cambia nadie desde un cliente. Quien administra la base lo asigna a mano, desde el
-- editor SQL del panel (rol postgres):
--   update public.profiles set role = 'publisher' where id = '<id de la cuenta>';

-- Rol de la sesión actual (null sin sesión). Lo usan las políticas y las funciones.
create function public.content_role() returns public.app_role
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

revoke all on function public.content_role() from public, anon, authenticated;
grant execute on function public.content_role() to authenticated;

-- Quién tocó el borrador por última vez (null en lo sembrado o publicado antes de esta migración).
alter table public.content_snapshots
  add column updated_by uuid references auth.users (id) on delete set null,
  add column updated_at timestamptz;

-- Autores y publicadores leen los borradores (los estudiantes y quien no ha entrado, no).
create policy content_snapshots_read_drafts on public.content_snapshots
  for select to authenticated
  using (public.content_role() in ('author', 'publisher'));

-- Guardar un borrador ---------------------------------------------------------------------------
-- Hay a lo sumo un borrador por versión de esquema: guardar de nuevo lo reemplaza. Su versión es la
-- siguiente a la mayor que existe. Aquí solo se comprueba la forma; el contenido lo valida la
-- herramienta de publicación con el mismo validador de la app (y la app es tolerante al leer).

create function public.save_content_draft(p_schema_version integer, p_content jsonb)
  returns table (id uuid, version integer)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  draft_id uuid;
  draft_version integer;
begin
  if uid is null then
    raise exception 'se necesita una sesión abierta' using errcode = '28000';
  end if;
  if coalesce(public.content_role() not in ('author', 'publisher'), true) then
    raise exception 'solo autores y publicadores guardan borradores' using errcode = '42501';
  end if;
  -- Solo la versión de esquema vigente o la siguiente: no se acumulan borradores de versiones
  -- inventadas.
  if p_schema_version is null or p_schema_version < 1 or p_schema_version > coalesce(
       (select max(l.schema_version) from public.content_latest l), 0) + 1 then
    raise exception 'versión de esquema no válida' using errcode = '22023';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object'
     or p_content ->> 'schemaVersion' is distinct from p_schema_version::text
     or jsonb_typeof(p_content -> 'units') <> 'array'
     or jsonb_array_length(p_content -> 'units') = 0
     or exists (
       select 1 from jsonb_array_elements(p_content -> 'units') u
       where jsonb_typeof(u) <> 'object' or jsonb_typeof(u -> 'id') is distinct from 'string'
     ) then
    raise exception 'el contenido debe ser un objeto con la misma schemaVersion y unidades con id'
      using errcode = '22023';
  end if;
  if octet_length(p_content::text) > 2097152 then
    raise exception 'el contenido pasa de 2 MiB' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('content:' || p_schema_version::text));

  select s.id, s.version into draft_id, draft_version
  from public.content_snapshots s
  where s.schema_version = p_schema_version and s.status = 'draft';

  if draft_id is null then
    insert into public.content_snapshots (schema_version, version, content, updated_by, updated_at)
    select p_schema_version, coalesce(max(s.version), 0) + 1, p_content, uid, now()
    from public.content_snapshots s
    where s.schema_version = p_schema_version
    returning content_snapshots.id, content_snapshots.version into draft_id, draft_version;
  else
    update public.content_snapshots s
    set content = p_content, updated_by = uid, updated_at = now()
    where s.id = draft_id;
  end if;

  return query select draft_id, draft_version;
end;
$$;

-- Descartar el borrador -------------------------------------------------------------------------

create function public.discard_content_draft(p_schema_version integer) returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  removed integer;
begin
  if auth.uid() is null then
    raise exception 'se necesita una sesión abierta' using errcode = '28000';
  end if;
  if coalesce(public.content_role() not in ('author', 'publisher'), true) then
    raise exception 'solo autores y publicadores descartan borradores' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('content:' || p_schema_version::text));
  delete from public.content_snapshots s
  where s.schema_version = p_schema_version and s.status = 'draft';
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

-- Publicar --------------------------------------------------------------------------------------
-- Solo un publicador, y solo un borrador que existe con esa versión: el mismo contenido que revisó
-- (si el autor lo reemplaza entre medias, la versión sigue igual, por eso se compara `updated_at`,
-- que el publicador lee junto al borrador).

create function public.publish_content(p_schema_version integer, p_version integer, p_updated_at timestamptz)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  draft public.content_snapshots;
begin
  if auth.uid() is null then
    raise exception 'se necesita una sesión abierta' using errcode = '28000';
  end if;
  if public.content_role() is distinct from 'publisher' then
    raise exception 'solo un publicador publica' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('content:' || p_schema_version::text));

  select * into draft
  from public.content_snapshots s
  where s.schema_version = p_schema_version and s.version = p_version and s.status = 'draft';
  if not found then
    raise exception 'no hay un borrador con esa versión' using errcode = 'P0002';
  end if;
  if p_updated_at is distinct from draft.updated_at then
    raise exception 'el borrador cambió desde que se revisó' using errcode = '40001';
  end if;

  update public.content_snapshots s
  set status = 'published', published_at = now(), updated_by = auth.uid(), updated_at = now()
  where s.id = draft.id;

  insert into public.content_latest (schema_version, snapshot_id)
  values (p_schema_version, draft.id)
  on conflict (schema_version) do update set snapshot_id = excluded.snapshot_id;

  return p_version;
end;
$$;

revoke all on function public.save_content_draft(integer, jsonb) from public, anon, authenticated;
revoke all on function public.discard_content_draft(integer) from public, anon, authenticated;
revoke all on function public.publish_content(integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.save_content_draft(integer, jsonb) to authenticated;
grant execute on function public.discard_content_draft(integer) to authenticated;
grant execute on function public.publish_content(integer, integer, timestamptz) to authenticated;

-- Audio ------------------------------------------------------------------------------------------
-- Bucket público (lo lee cualquiera por su dirección). Solo autores y publicadores suben, y solo
-- con nombre de huella (`audioKey`: 13 o 14 caracteres hexadecimales + .mp3), así no se ocupa un
-- nombre ajeno al contenido. Nadie actualiza ni borra desde un cliente: lo subido por error lo
-- limpia quien administra la base.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', true, 1048576, array['audio/mpeg'])
on conflict (id) do nothing;

create policy audio_insert_editors on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'audio'
    and name ~ '^[0-9a-f]{10,16}\.mp3$'
    and public.content_role() in ('author', 'publisher')
  );

create policy audio_select_editors on storage.objects
  for select to authenticated
  using (bucket_id = 'audio' and public.content_role() in ('author', 'publisher'));
