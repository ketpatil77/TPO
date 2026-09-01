create table if not exists public.student_profile_declarations (
  student_id uuid primary key references public.students(id) on delete cascade,
  no_certificates boolean not null default false,
  no_projects boolean not null default false,
  no_research boolean not null default false,
  no_internships boolean not null default false,
  no_competitions boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists student_profile_declarations_updated_at_idx
  on public.student_profile_declarations(updated_at);
