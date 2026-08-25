create schema if not exists private;
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now()
);
create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier_hash text unique not null,
  ip_hash text not null,
  failures integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.student_skills (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  skill text not null,
  unique(student_id, skill)
);
create table if not exists public.placement_drives (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  role text not null,
  jd_text text not null,
  application_deadline date,
  status text not null default 'draft' check (status in ('draft','open','closed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.drive_criteria (
  id uuid primary key default gen_random_uuid(),
  drive_id uuid unique not null references public.placement_drives(id) on delete cascade,
  branches jsonb not null default '[]',
  min_cgpa numeric(4,2) not null default 0 check (min_cgpa between 0 and 10),
  graduation_year text,
  required_skills jsonb not null default '[]',
  preferred_skills jsonb not null default '[]',
  keywords jsonb not null default '[]',
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz
);
create table if not exists public.drive_matches (
  id uuid primary key default gen_random_uuid(),
  drive_id uuid not null references public.placement_drives(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  run_id uuid not null,
  eligible boolean not null,
  score integer not null check (score between 0 and 100),
  matched_skills jsonb not null default '[]',
  missing_required jsonb not null default '[]',
  reasons jsonb not null default '[]',
  explanation jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(run_id, student_id)
);
create table if not exists public.shortlists (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  drive_id uuid not null references public.placement_drives(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null check (status in ('shortlisted','rejected','hold')),
  notes text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(drive_id, student_id)
);
create index if not exists idx_skills_student on public.student_skills(student_id);
create index if not exists idx_matches_drive_score on public.drive_matches(drive_id, score desc);
create index if not exists idx_shortlists_drive_status on public.shortlists(drive_id, status);
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and role = 'admin' and status = 'active'
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;
alter table public.roster enable row level security;
alter table public.students enable row level security;
alter table public.internships enable row level security;
alter table public.certificates enable row level security;
alter table public.diploma enable row level security;
alter table public.audit_log enable row level security;
alter table public.profiles enable row level security;
alter table public.login_attempts enable row level security;
alter table public.student_skills enable row level security;
alter table public.placement_drives enable row level security;
alter table public.drive_criteria enable row level security;
alter table public.drive_matches enable row level security;
alter table public.shortlists enable row level security;
do $$
declare table_name text;
begin
  foreach table_name in array array['roster','students','internships','certificates','diploma','audit_log','student_skills','placement_drives','drive_criteria','drive_matches','shortlists']
  loop
    execute format('drop policy if exists "Admins manage %1$s" on public.%1$I', table_name);
    execute format('create policy "Admins manage %1$s" on public.%1$I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', table_name);
  end loop;
end $$;
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
drop policy if exists "Admins manage profiles" on public.profiles;
create policy "Admins manage profiles" on public.profiles for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.profiles, public.roster, public.students, public.internships,
  public.certificates, public.diploma, public.audit_log, public.student_skills, public.placement_drives,
  public.drive_criteria, public.drive_matches, public.shortlists to authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];
drop policy if exists "Admins read resumes" on storage.objects;
create policy "Admins read resumes" on storage.objects for select to authenticated
using (bucket_id = 'resumes' and (select private.is_admin()));
drop policy if exists "Admins write resumes" on storage.objects;
create policy "Admins write resumes" on storage.objects for insert to authenticated
with check (bucket_id = 'resumes' and (select private.is_admin()));
drop policy if exists "Admins update resumes" on storage.objects;
create policy "Admins update resumes" on storage.objects for update to authenticated
using (bucket_id = 'resumes' and (select private.is_admin()))
with check (bucket_id = 'resumes' and (select private.is_admin()));
drop policy if exists "Admins delete resumes" on storage.objects;
create policy "Admins delete resumes" on storage.objects for delete to authenticated
using (bucket_id = 'resumes' and (select private.is_admin()));
-- Create first admin after adding user in Supabase Auth:
-- insert into public.profiles(user_id, role, status) values ('AUTH-USER-UUID', 'admin', 'active');;
