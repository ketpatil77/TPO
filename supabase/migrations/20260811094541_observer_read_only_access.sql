-- Five-department catalog, observer RBAC, read-only RLS, and 2 MB resumes.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'observer'));
alter table public.profiles add column if not exists department text;
alter table public.profiles drop constraint if exists profiles_department_check;
alter table public.profiles add constraint profiles_department_check
  check (department is null or department in ('AIML', 'CT', 'EE', 'ME', 'CE'));
create or replace function private.is_observer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and role = 'observer' and status = 'active'
  );
$$;
revoke all on function private.is_observer() from public, anon;
grant execute on function private.is_observer() to authenticated, service_role;
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'roster','students','internships','certificates','diploma','audit_log','student_skills',
    'placement_drives','drive_criteria','drive_matches','shortlists'
  ] loop
    execute format('drop policy if exists "Observers read %1$s" on public.%1$I', table_name);
    execute format('create policy "Observers read %1$s" on public.%1$I for select to authenticated using ((select private.is_observer()))', table_name);
  end loop;
end $$;
drop policy if exists "Observers read own profile" on public.profiles;
create policy "Observers read own profile" on public.profiles for select to authenticated
using ((select auth.uid()) = user_id and role = 'observer' and status = 'active');
drop policy if exists "Observers read resumes" on storage.objects;
create policy "Observers read resumes" on storage.objects for select to authenticated
using (bucket_id = 'resumes' and (select private.is_observer()));
update storage.buckets
set file_size_limit = 2097152, allowed_mime_types = array['application/pdf']
where id = 'resumes';
-- Canonicalize historic branch names without losing unknown source values.
update public.roster set branch = case lower(trim(branch))
  when 'aiml' then 'AIML' when 'artificial intelligence & machine learning' then 'AIML'
  when 'computer technology' then 'CT' when 'computer engineering' then 'CT' when 'information technology' then 'CT'
  when 'electrical engineering' then 'EE' when 'electronics & telecom' then 'EE'
  when 'mechanical engineering' then 'ME' when 'civil engineering' then 'CE'
  else branch end;
update public.students set branch = case lower(trim(branch))
  when 'aiml' then 'AIML' when 'artificial intelligence & machine learning' then 'AIML'
  when 'computer technology' then 'CT' when 'computer engineering' then 'CT' when 'information technology' then 'CT'
  when 'electrical engineering' then 'EE' when 'electronics & telecom' then 'EE'
  when 'mechanical engineering' then 'ME' when 'civil engineering' then 'CE'
  else branch end;
create index if not exists idx_roster_branch on public.roster(branch);
create index if not exists idx_students_branch on public.students(branch);
create index if not exists idx_students_prn on public.students(prn);
