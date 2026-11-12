-- Avisos y apertura de la liga más baratos (épica 10, historia 10.3).
--
-- 1. Avisos: como mucho uno por segundo y por cohorte. El cliente espera 1,5 s antes de releer la tabla
--    (`REFRESH_DELAY_MS`), así que lo que cambie en el segundo suprimido ya lo ve esa lectura: el
--    intervalo del servidor debe seguir siendo menor que esa espera.
-- 2. Conteo de personas por cohorte, mantenido por disparadores, para que abrir la liga no cuente los
--    miembros de cada cohorte de la semana.
-- 3. La limpieza semanal también borra los mensajes de Realtime de más de 7 días.

alter table public.league_cohorts
  add column people integer not null default 0 check (people >= 0),
  add column notified_at timestamptz;

update public.league_cohorts c
set people = (
  select count(*) from public.league_members m where m.cohort_id = c.id and not m.is_bot
);

-- Cohortes con plaza de cada semana, en el orden en que se llenan.
create index league_cohorts_open_idx on public.league_cohorts (week_start, created_at, id) where people < 30;

create function public.league_members_count() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.league_cohorts set people = people + 1 where id = new.cohort_id;
  else
    -- Al borrar una cohorte vieja sus miembros caen en cascada y la fila ya no está: no hay nada que restar.
    update public.league_cohorts set people = greatest(people - 1, 0) where id = old.cohort_id;
  end if;
  return null;
end;
$$;

revoke all on function public.league_members_count() from public, anon, authenticated;

create trigger league_members_count_insert
  after insert on public.league_members
  for each row when (not new.is_bot)
  execute function public.league_members_count();

create trigger league_members_count_delete
  after delete on public.league_members
  for each row when (not old.is_bot)
  execute function public.league_members_count();

-- El aviso sigue siendo privado y vacío (7.5); ahora se envía solo si pasó un segundo desde el último
-- de esa cohorte. La hora es la de la transacción: varios cambios de una misma sentencia cuentan como uno.
create or replace function public.league_members_notify() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_cohort uuid := (case when tg_op = 'DELETE' then old.cohort_id else new.cohort_id end);
begin
  update public.league_cohorts
  set notified_at = now()
  where id = v_cohort
    and (notified_at is null or notified_at <= now() - interval '1 second');
  if found then
    -- `realtime.send` no lanza si falla: un aviso perdido nunca estorba a quien guarda su progreso.
    perform realtime.send('{}'::jsonb, 'xp', 'league:' || v_cohort::text, true);
  end if;
  return null;
end;
$$;

create or replace function public.league_open(p_user uuid, p_at timestamptz) returns void
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
      and c.people < max_members
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

-- Los avisos de la liga (7.5) son efímeros: Realtime ya descarta sus particiones diarias, y esto es una red de
-- seguridad. Si el rol que corre la limpieza no tiene permiso sobre `realtime.messages`, se omite sin abortar el
-- resto de la retención.
create function public.purge_realtime_messages(p_days integer) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  delete from realtime.messages
  where inserted_at < (now() at time zone 'utc') - make_interval(days => p_days);
exception when insufficient_privilege or undefined_table then
  null;
end;
$$;

revoke all on function public.purge_realtime_messages(integer) from public, anon, authenticated;

create or replace function public.purge_old_data() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  league_weeks constant integer := 8;
  rejected_days constant integer := 30;
  realtime_days constant integer := 7;
begin
  -- Los miembros se van con su cohorte (`on delete cascade`).
  delete from public.league_cohorts
  where week_start < public.league_week_start(now()) - (league_weeks * 7);

  delete from public.progress_events
  where status = 'rejected'
    and received_at < now() - make_interval(days => rejected_days);

  perform public.purge_realtime_messages(realtime_days);
end;
$$;
