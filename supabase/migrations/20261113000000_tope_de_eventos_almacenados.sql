-- Tope de eventos almacenados por cuenta (épica 10, historia 10.7).
--
-- El tope diario de 5 000 eventos de la 7.2 no acota el total: los eventos aceptados sin `xp` no se borran
-- nunca. Se añade un límite de 20 000 filas por cuenta; pasado el límite el evento nuevo falla con PT429
-- (reintentable: el cliente lo deja pendiente y no pierde progreso). Reenviar un id ya guardado no falla.

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
