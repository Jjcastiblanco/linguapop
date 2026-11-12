-- Conteo de personas por cohorte y apertura de la liga (épica 10, historia 10.3). Se corre con `pnpm db:test`.
begin;
select plan(14);

select set_config('test.week', (date_trunc('week', now() at time zone 'utc'))::date::text, true);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@prueba.test'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@prueba.test'),
  ('00000000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@prueba.test');

insert into public.league_cohorts (id, week_start)
values ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date);

create function public.zz_personas(c text) returns integer language sql as $$
  select people from public.league_cohorts where id = c::uuid
$$;

-- Conteo -------------------------------------------------------------------------------------------
select is(public.zz_personas('00000000-0000-4000-8000-0000000000d1'), 0, 'una cohorte nueva empieza sin personas');
insert into public.league_members (cohort_id, week_start, user_id)
values ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000a');
select is(public.zz_personas('00000000-0000-4000-8000-0000000000d1'), 1, 'entrar una persona suma una');
insert into public.league_members (cohort_id, week_start, bot_name, is_bot)
values ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date, 'Robi', true);
select is(public.zz_personas('00000000-0000-4000-8000-0000000000d1'), 1, 'un bot no cuenta');
delete from public.league_members where is_bot;
select is(public.zz_personas('00000000-0000-4000-8000-0000000000d1'), 1, 'quitar un bot no resta');
delete from public.league_members where user_id = '00000000-0000-4000-8000-00000000000a';
select is(public.zz_personas('00000000-0000-4000-8000-0000000000d1'), 0, 'salir una persona resta una');

-- Borrar una cohorte con personas dentro no falla por el conteo
insert into public.league_members (cohort_id, week_start, user_id)
values ('00000000-0000-4000-8000-0000000000d1', current_setting('test.week')::date, '00000000-0000-4000-8000-00000000000a');
select lives_ok($$ delete from public.league_cohorts where id = '00000000-0000-4000-8000-0000000000d1' $$,
  'borrar una cohorte con personas (cascada) no falla');
select is((select count(*)::int from public.league_members where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'y se lleva a sus miembros');

-- Apertura -----------------------------------------------------------------------------------------------
insert into public.league_cohorts (id, week_start, people)
values
  ('00000000-0000-4000-8000-0000000000e1', current_setting('test.week')::date, 30),
  ('00000000-0000-4000-8000-0000000000e2', current_setting('test.week')::date, 29);
select public.league_open('00000000-0000-4000-8000-00000000000b', now());
select is((select cohort_id::text from public.league_members where user_id = '00000000-0000-4000-8000-00000000000b'),
  '00000000-0000-4000-8000-0000000000e2', 'abrir la liga toma la primera cohorte con plaza y salta la llena');
select is((select people from public.league_cohorts where id = '00000000-0000-4000-8000-0000000000e2'), 30, 'y la deja con 30 personas');
select public.league_open('00000000-0000-4000-8000-00000000000c', now());
select ok((select cohort_id::text from public.league_members where user_id = '00000000-0000-4000-8000-00000000000c')
  not in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2'),
  'con todas llenas, la siguiente persona va a una cohorte nueva');
select is((select count(*)::int from public.league_cohorts where week_start = current_setting('test.week')::date and people < 30), 1,
  'que queda con una persona y plaza para más');
select is((select count(*)::int from public.league_members where cohort_id = (select cohort_id from public.league_members where user_id = '00000000-0000-4000-8000-00000000000c')), 30,
  'y completa con bots hasta 30');

-- Permisos e índice --------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.league_members_count()', 'execute'), 'ningún cliente ejecuta el disparador del conteo');
select is((select indexdef from pg_indexes where indexname = 'league_cohorts_open_idx') ~ 'WHERE \(people < 30\)', true, 'el índice de cohortes con plaza es parcial sobre people < 30');

select * from finish();
rollback;
