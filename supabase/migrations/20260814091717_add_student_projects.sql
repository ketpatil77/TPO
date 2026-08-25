create table if not exists public.student_projects (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  summary text not null check (char_length(summary) between 1 and 2000),
  technologies text check (technologies is null or char_length(technologies) <= 500),
  project_url text,
  repository_url text,
  completed_on date,
  created_at timestamptz not null default now()
);
create index if not exists idx_student_projects_student_id on public.student_projects(student_id);
alter table public.student_projects enable row level security;
drop policy if exists "Admins manage student_projects" on public.student_projects;
create policy "Admins manage student_projects" on public.student_projects
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
revoke all on public.student_projects from anon;
grant select, insert, update, delete on public.student_projects to authenticated, service_role;
