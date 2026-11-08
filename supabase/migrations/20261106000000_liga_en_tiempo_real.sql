-- La liga en tiempo real (épica 7, historia 7.5, AD-7, AD-8). Realtime publica tablas, no vistas, y
-- `league_members` no se abre a los clientes, así que los cambios llegan por difusión desde la base:
-- cuando una persona entra a una cohorte o cambia su XP semanal, un disparador manda un aviso
-- PRIVADO y SIN DATOS al canal `league:<cohorte>`. El aviso solo dice que algo cambió; el cliente
-- vuelve a leer la vista `league_standings`, que ya filtra por la sesión. Así la peor fuga posible es
-- saber que la propia cohorte cambió: ni nombres, ni XP, ni correo, ni eventos viajan por el canal.
-- Los bots no avisan: avanzan cuando alguien abre la liga y esa persona ya relee la tabla.

-- Canal de la persona -----------------------------------------------------------------------------

-- El canal de la cohorte de la semana en curso (lunes a lunes UTC, AD-13) de quien llama, o nulo. Corre
-- con los permisos de su dueño porque `league_members` está cerrada a los clientes.
create function public.league_my_topic() returns text
  language sql stable security definer
  set search_path = ''
as $$
  select 'league:' || m.cohort_id::text
  from public.league_members m
  where m.user_id = (select auth.uid())
    and m.week_start = public.league_week_start(now())
$$;

revoke all on function public.league_my_topic() from public, anon, authenticated;
grant execute on function public.league_my_topic() to authenticated;

-- Autorización de la escucha ---------------------------------------------------------------------------

-- Realtime consulta esta política antes de suscribir a un canal privado: solo se escucha el de la
-- propia cohorte de esta semana. Sin política de inserción, ningún cliente puede difundir mensajes.
create policy league_listen_own_cohort on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.messages.topic = (select public.league_my_topic())
  );

-- Aviso -------------------------------------------------------------------------------------------

create function public.league_members_notify() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- `realtime.send` no lanza si falla: un aviso perdido nunca estorba a quien guarda su progreso.
  perform realtime.send(
    '{}'::jsonb,
    'xp',
    'league:' || (case when tg_op = 'DELETE' then old.cohort_id else new.cohort_id end)::text,
    true
  );
  return null;
end;
$$;

revoke all on function public.league_members_notify() from public, anon, authenticated;

-- Solo personas: entrar, salir (borrar la cuenta) y cambiar el XP semanal. Los bots avanzan en bloque
-- al abrir la liga.
create trigger league_members_notify_insert
  after insert on public.league_members
  for each row when (not new.is_bot)
  execute function public.league_members_notify();

create trigger league_members_notify_xp
  after update of weekly_xp on public.league_members
  for each row when (not new.is_bot and new.weekly_xp is distinct from old.weekly_xp)
  execute function public.league_members_notify();

create trigger league_members_notify_delete
  after delete on public.league_members
  for each row when (not old.is_bot)
  execute function public.league_members_notify();
