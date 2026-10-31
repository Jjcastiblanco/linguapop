-- Borrar la cuenta y sus datos (épica 5, AD-8, AD-9). La función corre con los permisos de su
-- dueño, así el cliente no necesita ninguna clave de servicio: solo puede borrar la cuenta de su
-- propia sesión, nunca otra. Borrar el usuario arrastra su perfil y sus eventos (on delete cascade).

create function public.delete_my_account() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'se necesita una sesión abierta' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
