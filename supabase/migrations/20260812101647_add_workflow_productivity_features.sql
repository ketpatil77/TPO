create table if not exists public.correction_requests (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
  field_name text not null, message text not null, status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_by uuid, created_at timestamptz not null default now(), resolved_at timestamptz
);
create table if not exists public.drive_applications (
  id uuid primary key default gen_random_uuid(), key text unique not null, drive_id uuid not null references public.placement_drives(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'applied' check (status in ('applied','eligible','test','interview','selected','rejected','withdrawn')),
  eligibility jsonb not null default '{}'::jsonb, applied_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), student_id uuid references public.students(id) on delete cascade,
  audience text not null default 'student' check (audience in ('student','all')),
  title text not null, message text not null, priority text not null default 'normal' check (priority in ('normal','important')),
  read_at timestamptz, created_at timestamptz not null default now()
);
alter table public.correction_requests enable row level security;
alter table public.drive_applications enable row level security;
alter table public.notifications enable row level security;
revoke all on public.correction_requests, public.drive_applications, public.notifications from anon, authenticated;
create index if not exists idx_corrections_student_status on public.correction_requests(student_id,status);
create index if not exists idx_applications_student_drive on public.drive_applications(student_id,drive_id);
create index if not exists idx_notifications_student_created on public.notifications(student_id,created_at desc);
