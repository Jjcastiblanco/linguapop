-- Base de la liga (épica 7, historia 7.1, AD-7, AD-8). Cohortes semanales y sus miembros, reales o
-- bots. Las tablas quedan cerradas: ningún cliente las lee ni las escribe. La única lectura entre
-- usuarios es la vista `league_standings`, que solo muestra la cohorte de quien consulta. Las
-- funciones que asignan cohortes y calculan el XP semanal llegan en las historias 7.2 y 7.3.

-- Cohortes ------------------------------------------------------------------------------------

create table public.league_cohorts (
  id uuid primary key default gen_random_uuid(),
  -- Lunes de la semana, en UTC (AD-13).
  week_start date not null check (extract(isodow from week_start) = 1),
  created_at timestamptz not null default now(),
  -- Permite que los miembros copien la semana y la clave compuesta las mantenga iguales.
  unique (id, week_start)
);

alter table public.league_cohorts enable row level security;

-- Miembros ------------------------------------------------------------------------------------

create table public.league_members (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null,
  week_start date not null,
  -- Nulo cuando el miembro es un bot.
  user_id uuid references auth.users (id) on delete cascade,
  bot_name text check (bot_name is null or char_length(bot_name) between 1 and 40),
  is_bot boolean not null default false,
  -- Lo escriben solo funciones del servidor (AD-7).
  weekly_xp integer not null default 0 check (weekly_xp >= 0),
  created_at timestamptz not null default now(),
  foreign key (cohort_id, week_start) references public.league_cohorts (id, week_start) on delete cascade,
  -- Un bot lleva nombre y no usuario; una persona, usuario y no nombre de bot.
  check (is_bot = (user_id is null)),
  check (is_bot = (bot_name is not null)),
  -- Una persona está en una sola cohorte por semana.
  unique (user_id, week_start)
);

create index league_members_cohort_idx on public.league_members (cohort_id);

alter table public.league_members enable row level security;

-- Sin permisos de tabla para ningún cliente y sin políticas: solo las funciones del servidor.
revoke all on public.league_cohorts from anon, authenticated;
revoke all on public.league_members from anon, authenticated;

-- Vista de la liga ----------------------------------------------------------------------------

-- Corre con los permisos de su dueño (así las tablas siguen cerradas) y filtra por la sesión: cada
-- persona ve solo su cohorte de la semana en curso (lunes a lunes, UTC; AD-13), nunca las de semanas
-- pasadas. El puesto lo calcula el servidor (AD-7): empates comparten puesto. Nunca expone correo,
-- `user_id` ni eventos; `is_me` marca la fila propia.
create view public.league_standings as
select
  m.cohort_id,
  m.week_start,
  case
    when m.is_bot then m.bot_name
    else coalesce(nullif(btrim(p.display_name), ''), 'Estudiante')
  end as display_name,
  m.weekly_xp,
  m.is_bot,
  coalesce(m.user_id = (select auth.uid()), false) as is_me,
  (rank() over (partition by m.cohort_id order by m.weekly_xp desc))::int as rank
from public.league_members m
left join public.profiles p on p.id = m.user_id
where m.week_start = (date_trunc('week', now() at time zone 'utc'))::date
  and m.cohort_id in (
    select own.cohort_id
    from public.league_members own
    where own.user_id = (select auth.uid())
      and own.week_start = (date_trunc('week', now() at time zone 'utc'))::date
  );

revoke all on public.league_standings from public, anon, authenticated;
grant select on public.league_standings to authenticated;
