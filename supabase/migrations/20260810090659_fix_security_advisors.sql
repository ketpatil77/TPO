revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
drop policy if exists "Admins manage profiles" on public.profiles;
create policy "Admins insert profiles"
on public.profiles for insert to authenticated
with check ((select private.is_admin()));
create policy "Admins update profiles"
on public.profiles for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Admins delete profiles"
on public.profiles for delete to authenticated
using ((select private.is_admin()));
