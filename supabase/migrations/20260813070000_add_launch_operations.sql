create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid,
  file_name text,
  status text not null default 'completed' check (status in ('processing','completed','failed','undone')),
  total_count integer not null default 0,
  added_count integer not null default 0,
  updated_count integer not null default 0,
  failed_count integer not null default 0,
  inserted_prns jsonb not null default '[]'::jsonb,
  previous_rows jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create table if not exists public.launch_backups (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  created_by uuid,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  restored_at timestamptz
);
alter table public.import_batches enable row level security;
alter table public.launch_backups enable row level security;
revoke all on public.import_batches, public.launch_backups from anon, authenticated;
alter table public.placement_drives drop constraint if exists placement_drives_status_check;
alter table public.placement_drives add constraint placement_drives_status_check
  check (status in ('draft','review_pending','open','closed'));
alter table public.placement_drives add column if not exists approved_by uuid;
alter table public.placement_drives add column if not exists approved_at timestamptz;
alter table public.placement_drives add column if not exists reminder_sent_at timestamptz;
create index if not exists idx_import_batches_created on public.import_batches(created_at desc);
create index if not exists idx_launch_backups_created on public.launch_backups(created_at desc);
