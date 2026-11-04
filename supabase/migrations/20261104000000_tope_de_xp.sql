-- Tope de XP y límites de los eventos (épica 7, historia 7.2, AD-7). El cliente calcula el `xp` de
-- cada sesión, llamada y cofre y lo manda en el payload; aquí el servidor decide si lo acepta. Lo que
-- supera el tope no se descarta: se guarda como `rejected` con su motivo, y el cliente, que lo
-- descubre al sincronizar, lo excluye de su estado. La liga (historia 7.3) suma solo los `accepted`.
--
-- Los topes son constantes de esta función; subirlos es una migración. El día se mide con
-- `received_at` (la hora del servidor), nunca con `occurred_at`, que decide el cliente: falsear la
-- fecha de un evento no da ventaja. Las inserciones de una misma persona se serializan con un
-- candado, así que enviar peticiones en paralelo no sortea los topes. Los eventos anteriores sin `xp`
-- se aceptan y no cuentan para la liga. Límite aceptado: quien juega sin red varios días y sincroniza
-- de golpe cuenta todo en un solo día del servidor, y lo que pase de 3000 de XP queda rechazado.
-- La liga (historia 7.3) debe sumar solo `status = 'accepted'` de los tres tipos de abajo.

alter table public.progress_events
  add column status text not null default 'accepted' check (status in ('accepted', 'rejected')),
  add column rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 80);

-- El tope del día y el límite de eventos por día consultan lo recibido hoy por persona.
create index progress_events_user_received_idx on public.progress_events (user_id, received_at);

create function public.progress_events_validate() returns trigger
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

revoke all on function public.progress_events_validate() from public, anon, authenticated;

-- Corre después de `progress_events_set_user` (por orden de nombre), que ya puso el usuario.
create trigger progress_events_validate
  before insert on public.progress_events
  for each row execute function public.progress_events_validate();
