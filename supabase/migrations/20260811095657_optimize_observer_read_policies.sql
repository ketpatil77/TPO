-- One SELECT policy per table keeps all-branch observer reads efficient at 800+ students.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'roster','students','internships','certificates','diploma','audit_log','student_skills',
    'placement_drives','drive_criteria','drive_matches','shortlists'
  ] loop
    execute format('drop policy if exists "Admins manage %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Observers read %1$s" on public.%1$I', table_name);
    execute format('create policy "Staff read %1$s" on public.%1$I for select to authenticated using ((select private.is_admin()) or (select private.is_observer()))', table_name);
    execute format('create policy "Admins insert %1$s" on public.%1$I for insert to authenticated with check ((select private.is_admin()))', table_name);
    execute format('create policy "Admins update %1$s" on public.%1$I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', table_name);
    execute format('create policy "Admins delete %1$s" on public.%1$I for delete to authenticated using ((select private.is_admin()))', table_name);
  end loop;
end $$;
drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Observers read own profile" on public.profiles;
create policy "Staff read permitted profiles" on public.profiles for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
drop policy if exists "Admins read resumes" on storage.objects;
drop policy if exists "Observers read resumes" on storage.objects;
create policy "Staff read resumes" on storage.objects for select to authenticated
using (bucket_id = 'resumes' and ((select private.is_admin()) or (select private.is_observer())));
