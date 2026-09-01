create table public.student_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  subscription jsonb not null,
  last_notified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_push_subscription_shape check (
    jsonb_typeof(subscription) = 'object'
    and subscription ? 'endpoint'
    and subscription ? 'keys'
    and subscription->>'endpoint' = endpoint
    and subscription->'keys' ? 'p256dh'
    and subscription->'keys' ? 'auth'
  )
);

create index student_push_subscriptions_student_id_idx on public.student_push_subscriptions(student_id);
alter table public.student_push_subscriptions enable row level security;
revoke all on table public.student_push_subscriptions from anon, authenticated;
grant all on table public.student_push_subscriptions to service_role;
