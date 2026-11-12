-- Retención de datos (épica 10, historia 10.2): el plan gratis de Supabase da 500 MB de base, y la liga
-- y los eventos rechazados solo crecen. Una función borra lo viejo y `pg_cron` la corre cada lunes.
--
-- Qué se conserva: las cohortes de la semana en curso y de las 8 anteriores (con sus miembros, personas
-- y bots) y los eventos rechazados de los últimos 30 días. Los eventos aceptados no se borran nunca: son
-- el progreso de la persona (AD-6). Un rechazado ya borrado que un dispositivo que nunca se enteró
-- reenvíe se evalúa de nuevo como un evento nuevo; el cliente marca en local los rechazados que conoce.

create extension if not exists pg_cron;

create function public.purge_old_data() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  league_weeks constant integer := 8;
  rejected_days constant integer := 30;
begin
  -- Los miembros se van con su cohorte (`on delete cascade`).
  delete from public.league_cohorts
  where week_start < public.league_week_start(now()) - (league_weeks * 7);

  delete from public.progress_events
  where status = 'rejected'
    and received_at < now() - make_interval(days => rejected_days);
end;
$$;

-- Solo la corre el trabajo programado (con el rol de la base); ningún cliente.
revoke all on function public.purge_old_data() from public, anon, authenticated;

-- Borrar miembros de semanas pasadas no debe avisar a nadie: el aviso de la 7.5 llegaría a canales que ya
-- no existen. Quien borra su cuenta (semana en curso) sigue avisando a su cohorte.
drop trigger league_members_notify_delete on public.league_members;
create trigger league_members_notify_delete
  after delete on public.league_members
  for each row when (
    not old.is_bot
    and old.week_start >= (date_trunc('week', now() at time zone 'utc'))::date
  )
  execute function public.league_members_notify();

-- Cada lunes a las 03:17 UTC. Programar con el mismo nombre actualiza el trabajo en vez de duplicarlo.
select cron.schedule('purge-old-data', '17 3 * * 1', 'select public.purge_old_data()');
