alter table public.notifications add column if not exists campaign_key text;
create unique index if not exists notifications_campaign_student_uidx on public.notifications(campaign_key, student_id);

create table if not exists public.notification_broadcast_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null,
  subscription_id uuid not null,
  student_id uuid not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','deleted')),
  attempts integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  unique(campaign_key, subscription_id)
);
alter table public.notification_broadcast_deliveries enable row level security;
revoke all on table public.notification_broadcast_deliveries from anon, authenticated;
