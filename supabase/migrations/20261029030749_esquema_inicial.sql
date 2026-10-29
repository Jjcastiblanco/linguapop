-- Esquema inicial (épica 5, AD-5, AD-6, AD-8): perfiles con rol, eventos de progreso y snapshots de
-- contenido. Todo con seguridad por fila: el cliente solo usa la clave anónima y su sesión.
-- Los totales (XP semanal, liga) los derivará el servidor (AD-7) en la épica de la liga.

create type public.app_role as enum ('student', 'author', 'publisher');

-- Perfiles ------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'student',
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Un perfil solo cambia su nombre visible; el rol no lo cambia nadie desde un cliente.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Cada cuenta nueva nace con su perfil de estudiante.
create function public.handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Eventos de progreso -------------------------------------------------------------------------

create table public.progress_events (
  -- UUID generado en el cliente: reenviar el mismo evento no lo duplica (AD-6).
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (char_length(type) between 1 and 80),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  content_version text not null,
  source text not null default 'app' check (source in ('app', 'legacy')),
  received_at timestamptz not null default now()
);

create index progress_events_user_occurred_idx
  on public.progress_events (user_id, occurred_at);

alter table public.progress_events enable row level security;

create policy progress_events_select_own on public.progress_events
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy progress_events_insert_own on public.progress_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Solo se añaden eventos: sin actualizar ni borrar desde un cliente.
revoke all on public.progress_events from anon, authenticated;
grant select, insert on public.progress_events to authenticated;

-- El usuario lo pone el servidor desde la sesión; ni la columna ni el payload lo deciden (AD-6).
create function public.progress_events_set_user() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  new.payload := new.payload - 'user_id';
  new.received_at := now();
  return new;
end;
$$;

create trigger progress_events_set_user
  before insert on public.progress_events
  for each row execute function public.progress_events_set_user();

-- Contenido -----------------------------------------------------------------------------------

create table public.content_snapshots (
  id uuid primary key default gen_random_uuid(),
  schema_version integer not null check (schema_version >= 1),
  version integer not null check (version >= 1),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (schema_version, version),
  check ((status = 'published') = (published_at is not null))
);

-- Un puntero `latest` por versión de esquema: la app lee solo el de la suya (AD-5).
create table public.content_latest (
  schema_version integer primary key,
  snapshot_id uuid not null references public.content_snapshots (id)
);

alter table public.content_snapshots enable row level security;
alter table public.content_latest enable row level security;

-- Cualquiera, también quien no ha iniciado sesión, lee lo publicado; los borradores, nadie.
create policy content_snapshots_read_published on public.content_snapshots
  for select to anon, authenticated
  using (status = 'published');

create policy content_latest_read_published on public.content_latest
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.content_snapshots s
      where s.id = snapshot_id and s.status = 'published'
    )
  );

-- La escritura de contenido (autores y publicadores) llega con el panel de administración.
revoke all on public.content_snapshots, public.content_latest from anon, authenticated;
grant select on public.content_snapshots, public.content_latest to anon, authenticated;
