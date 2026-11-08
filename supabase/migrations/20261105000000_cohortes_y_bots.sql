-- Cohortes semanales, bots y XP semanal (épica 7, historia 7.3, AD-7, AD-13). `open_league()` la
-- llama el cliente al abrir la liga: asigna a la persona, una sola vez por semana UTC, a una cohorte
-- de hasta 30 miembros y la completa con bots marcados. No hay tarea programada (el plan gratis de
-- Supabase no garantiza un cron): la cohorte nace al abrir la liga. El XP semanal de las personas lo
-- suma un disparador con los eventos que el servidor aceptó (7.2); el cliente nunca escribe totales.
-- La semana siempre la calcula el servidor: lunes 00:00 UTC.

-- Utilidades -----------------------------------------------------------------------------------

-- Lunes (UTC) de la semana a la que pertenece un instante.
create function public.league_week_start(p_at timestamptz) returns date
  language sql immutable
  set search_path = ''
as $$
  select (date_trunc('week', p_at at time zone 'utc'))::date
$$;

-- Objetivo semanal de un bot (100 a 1499): depende solo de la semilla, así que repetirla da lo mismo.
create function public.league_bot_target(p_seed text) returns integer
  language sql immutable
  set search_path = ''
as $$
  select 100 + ((hashtextextended(p_seed, 0) & 9223372036854775807) % 1400)::integer
$$;

-- XP de un bot en un instante: crece desde 0 el lunes hasta su objetivo al cerrar la semana.
create function public.league_bot_xp(p_seed text, p_week_start date, p_at timestamptz) returns integer
  language sql immutable
  set search_path = ''
as $$
  select floor(
    public.league_bot_target(p_seed)
    * greatest(0, least(1, extract(epoch from (p_at - (p_week_start::timestamp at time zone 'utc'))) / 604800))
  )::integer
$$;

-- La asignación busca las cohortes de una semana por antigüedad.
create index league_cohorts_week_idx on public.league_cohorts (week_start, created_at);

-- Asignación ----------------------------------------------------------------------------------

-- Interna: la hora entra como argumento para poder probar el cambio de semana. Ningún cliente la
-- llama; solo `open_league()` y las pruebas.
create function public.league_open(p_user uuid, p_at timestamptz) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  max_members constant integer := 30;
  names constant text[] := array[
    'Robi', 'Luna', 'Nico', 'Mara', 'Teo', 'Ivy', 'Leo', 'Zoe',
    'Max', 'Eva', 'Hugo', 'Lia', 'Dante', 'Nora', 'Bruno', 'Alma',
    'Ian', 'Sol', 'Oli', 'Rita', 'Kai', 'Vera', 'Sam', 'Lola',
    'Mateo', 'Ada', 'Tomás', 'Iris', 'Pablo', 'Mía', 'Axel', 'Noa'
  ];
  v_week date := public.league_week_start(p_at);
  v_week_ts timestamptz := v_week::timestamp at time zone 'utc';
  v_cohort uuid;
  v_xp integer;
  v_offset integer;
begin
  -- Mismo candado por persona que toma `progress_events_validate` y mantiene hasta confirmar: así se
  -- ve todo evento ya confirmado y uno nuevo espera a que la asignación termine.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select cohort_id into v_cohort
  from public.league_members
  where user_id = p_user and week_start = v_week;

  if v_cohort is null then
    -- Las asignaciones de una semana se hacen de una en una para no pasar de 30 por cohorte.
    perform pg_advisory_xact_lock(hashtextextended('league:' || v_week::text, 0));

    select c.id into v_cohort
    from public.league_cohorts c
    where c.week_start = v_week
      and (select count(*) from public.league_members m where m.cohort_id = c.id and not m.is_bot) < max_members
    order by c.created_at, c.id
    limit 1;

    if v_cohort is null then
      insert into public.league_cohorts (week_start) values (v_week) returning id into v_cohort;
      v_offset := (hashtextextended(v_cohort::text, 0) & 1023)::integer;
      -- Una plaza queda para la persona; las otras 29 son bots con nombre distinto.
      insert into public.league_members (cohort_id, week_start, bot_name, is_bot)
      select v_cohort, v_week, names[((v_offset + g) % array_length(names, 1)) + 1], true
      from generate_series(0, max_members - 2) as g;
    elsif (select count(*) from public.league_members where cohort_id = v_cohort) >= max_members then
      -- La cohorte está completa con bots: uno cede su lugar. Quien toca los bots de una cohorte
      -- toma antes su candado (siempre después de los de persona y semana), así dos aperturas
      -- simultáneas no se bloquean entre sí por filas.
      perform pg_advisory_xact_lock(hashtextextended('league-cohort:' || v_cohort::text, 0));
      delete from public.league_members
      where id = (
        select id from public.league_members where cohort_id = v_cohort and is_bot order by id limit 1
      );
    end if;

    -- El XP aceptado de esta semana antes de abrir la liga también cuenta. Los topes de 7.2 dan como
    -- máximo 21 000 por semana (3000 × 7); el límite aquí protege de filas anteriores a 7.2, que
    -- quedaron `accepted` sin pasar por el tope, y evita desbordar el entero.
    select least(coalesce(sum((payload ->> 'xp')::bigint), 0), 21000)::integer into v_xp
    from public.progress_events
    where user_id = p_user
      and status = 'accepted'
      and received_at >= v_week_ts
      and received_at < v_week_ts + interval '7 days'
      and type in ('session_completed@1', 'call_completed@1', 'chest_opened@1')
      and jsonb_typeof(payload -> 'xp') = 'number'
      and (payload ->> 'xp') ~ '^[0-9]{1,9}$';

    insert into public.league_members (cohort_id, week_start, user_id, weekly_xp)
    values (v_cohort, v_week, p_user, v_xp);
  end if;

  -- Los bots avanzan con la semana; solo suben y solo se escribe si cambian.
  perform pg_advisory_xact_lock(hashtextextended('league-cohort:' || v_cohort::text, 0));
  update public.league_members m
  set weekly_xp = public.league_bot_xp(m.cohort_id::text || m.week_start::text || m.bot_name, m.week_start, p_at)
  where m.cohort_id = v_cohort
    and m.is_bot
    and m.weekly_xp < public.league_bot_xp(m.cohort_id::text || m.week_start::text || m.bot_name, m.week_start, p_at);
end;
$$;

-- Pública: la persona es la de la sesión y la hora es la del servidor.
create function public.open_league() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'se necesita una sesión' using errcode = '28000';
  end if;
  perform public.league_open((select auth.uid()), now());
end;
$$;

revoke all on function public.league_week_start(timestamptz) from public, anon, authenticated;
revoke all on function public.league_bot_target(text) from public, anon, authenticated;
revoke all on function public.league_bot_xp(text, date, timestamptz) from public, anon, authenticated;
revoke all on function public.league_open(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.open_league() from public, anon, authenticated;
grant execute on function public.open_league() to authenticated;

-- XP semanal -----------------------------------------------------------------------------------

-- Suma al total de la semana el `xp` de cada evento que el servidor aceptó (7.2). Solo cuentan los
-- tres tipos que dan XP, con `xp` numérico válido, y la semana es la de `received_at`. Si la persona
-- aún no abrió la liga esa semana no hay fila que sumar: `league_open` lo recupera al asignarla.
-- Corre solo al insertar: el estado de un evento lo fija `progress_events_validate` en ese momento y
-- ningún cliente puede cambiarlo después (no hay permiso de `update`). La carrera con `league_open`
-- la evita el candado por persona que ese disparador previo mantiene hasta confirmar la inserción.
create function public.progress_events_league_xp() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.status = 'accepted'
    and new.type in ('session_completed@1', 'call_completed@1', 'chest_opened@1')
    and jsonb_typeof(new.payload -> 'xp') = 'number'
    and (new.payload ->> 'xp') ~ '^[0-9]{1,9}$' then
    update public.league_members
    set weekly_xp = weekly_xp + (new.payload ->> 'xp')::integer
    where user_id = new.user_id
      and week_start = public.league_week_start(new.received_at);
  end if;
  return null;
end;
$$;

revoke all on function public.progress_events_league_xp() from public, anon, authenticated;

create trigger progress_events_league_xp
  after insert on public.progress_events
  for each row execute function public.progress_events_league_xp();
