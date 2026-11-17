-- Freno global de eventos (épica 11, historia 11.1).
--
-- El tope por cuenta (10.7) no acota el total si las cuentas se crean sin límite: unas 65 cuentas llenarían los
-- 500 MB del plan gratis y Supabase pondría el proyecto en solo lectura. Cuando `progress_events` (tabla e
-- índices) pesa 250 MB o más, el evento nuevo de cualquier cuenta falla con PT429 (reintentable: el cliente lo
-- deja pendiente). Reenviar un id ya guardado y la lectura no cambian. El límite se puede sustituir con
-- `alter database postgres set linguapop.max_events_bytes = '<bytes>'` (la prueba lo usa con `set_config`).
--
-- Ojo operativo: `pg_total_relation_size` mide archivos. Borrar filas (retención, borrar cuenta) no encoge la tabla
-- hasta un `VACUUM FULL`, así que si el freno se activa, para recuperar hay que borrar las cuentas abusivas, correr
-- `VACUUM FULL public.progress_events` o subir el límite con el `alter database` de arriba.

create or replace function public.progress_events_validate() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  -- Tope de XP por evento: el mayor premio real es una sesión cronometrada (40 aciertos × 5 = 200).
  max_xp_event constant integer := 250;
  -- Tope de XP por día y persona: unas 25 lecciones perfectas.
  max_xp_day constant integer := 3000;
  -- Eventos por día y persona; frena el llenado de la base con cuentas de guiones. Al pasarse se
  -- responde 429 (PT429): no es un rechazo definitivo y el cliente reintenta al día siguiente.
  max_events_day constant integer := 5000;
  -- Eventos que una cuenta puede guardar en total (aceptados y rechazados). Los eventos sin `xp` no se
  -- borran nunca (AD-6) y, con el tope diario, una cuenta de guiones llenaría ~1,9 MB al día de los 500 MB del
  -- plan gratis. Unos 4 años de uso diario; pasado el tope el servidor responde 429 y el cliente los
  -- conserva pendientes (spike 10.4).
  max_events_total constant integer := 20000;
  -- Tamaño de `progress_events` (con índices) a partir del cual no se guardan eventos nuevos: la mitad de los
  -- 500 MB del plan gratis, para dejar margen a la liga, a Auth y a los índices de las demás tablas.
  max_table_bytes bigint := 262144000;
  max_table_setting text;
  max_payload_bytes integer;
  day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  xp_text text;
  v_xp integer;
  xp_today bigint;
begin
  -- Una persona inserta de una en una: sin esto, peticiones en paralelo no ven las filas de las
  -- demás y se pasan de los topes.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  -- Reenviar un id ya guardado no hace nada (la inserción lo ignora); no debe fallar por los límites.
  if exists (select 1 from public.progress_events where id = new.id) then
    return new;
  end if;

  -- Freno global: la tabla pesa demasiado para todas las cuentas. `pg_total_relation_size` lee metadatos.
  -- El valor sustituto solo cuenta si es un entero; cualquier otro texto se ignora y queda el de la constante.
  max_table_setting := current_setting('linguapop.max_events_bytes', true);
  if max_table_setting ~ '^[0-9]{1,15}$' then
    max_table_bytes := max_table_setting::bigint;
  end if;
  if pg_total_relation_size('public.progress_events') >= max_table_bytes then
    raise exception 'la base está llena, reintenta más tarde' using errcode = 'PT429';
  end if;

  -- Rechazos que no se guardan: el evento no cabe en las reglas de la tabla.
  max_payload_bytes := case when new.type = 'legacy_imported@1' then 65536 else 8192 end;
  if octet_length(new.payload::text) > max_payload_bytes then
    raise exception 'el evento es demasiado grande' using errcode = '23514';
  end if;
  -- La importación heredada es única por cuenta (el id se deriva de la cuenta).
  if new.type = 'legacy_imported@1' and exists (
    select 1 from public.progress_events
    where user_id = new.user_id and type = 'legacy_imported@1'
  ) then
    raise exception 'ya hay una importación heredada' using errcode = '23514';
  end if;
  if char_length(new.content_version) > 20 then
    raise exception 'la versión del contenido es demasiado larga' using errcode = '23514';
  end if;
  if (
    select count(*) from public.progress_events
    where user_id = new.user_id and received_at >= day_start
  ) >= max_events_day then
    raise exception 'demasiados eventos hoy' using errcode = 'PT429';
  end if;
  -- Se acota con `limit` para no recorrer más filas de las necesarias.
  if (
    select count(*) from (
      select 1 from public.progress_events where user_id = new.user_id limit max_events_total
    ) as guardados
  ) >= max_events_total then
    raise exception 'demasiados eventos guardados' using errcode = 'PT429';
  end if;

  -- El estado lo decide solo el servidor, aunque el cliente mande otro.
  new.status := 'accepted';
  new.rejection_reason := null;

  if new.type in ('session_completed@1', 'call_completed@1', 'chest_opened@1')
    and new.payload ? 'xp' then
    xp_text := new.payload ->> 'xp';
    if jsonb_typeof(new.payload -> 'xp') <> 'number' or xp_text !~ '^[0-9]{1,9}$' then
      new.status := 'rejected';
      new.rejection_reason := 'xp_invalido';
    else
      v_xp := xp_text::integer;
      if v_xp > max_xp_event then
        new.status := 'rejected';
        new.rejection_reason := 'xp_sobre_el_tope_del_evento';
      else
        select coalesce(sum((payload ->> 'xp')::integer), 0) into xp_today
        from public.progress_events
        where user_id = new.user_id
          and status = 'accepted'
          and received_at >= day_start
          and type in ('session_completed@1', 'call_completed@1', 'chest_opened@1')
          and jsonb_typeof(payload -> 'xp') = 'number'
          and (payload ->> 'xp') ~ '^[0-9]{1,9}$';
        if xp_today + v_xp > max_xp_day then
          new.status := 'rejected';
          new.rejection_reason := 'xp_sobre_el_tope_del_dia';
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;
