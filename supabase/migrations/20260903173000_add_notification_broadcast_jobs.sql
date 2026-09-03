create table if not exists public.notification_broadcasts (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null unique,
  status text not null default 'running' check (status in ('running','completed','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.notification_broadcasts enable row level security;
revoke all on table public.notification_broadcasts from anon, authenticated;
