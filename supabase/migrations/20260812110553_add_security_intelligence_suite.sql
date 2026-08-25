alter table public.profiles add column if not exists last_login_at timestamptz;
alter table public.profiles add column if not exists session_version integer not null default 2;
alter table public.notifications add column if not exists expires_at timestamptz;
alter table public.notifications add column if not exists action_url text;
create table if not exists public.notification_reads (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  key text not null unique,
  read_at timestamptz not null default now(),
  unique(notification_id, student_id)
);
create index if not exists idx_notification_reads_student on public.notification_reads(student_id, notification_id);
alter table public.notification_reads enable row level security;
revoke all on public.notification_reads from anon, authenticated;
