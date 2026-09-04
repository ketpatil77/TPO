create table if not exists public.leaderboard_rank_state (
    id uuid primary key default gen_random_uuid(),
    scope_key text not null default 'college',
    student_id uuid not null references public.students(id) on delete cascade,
    current_rank integer not null check (current_rank > 0),
    previous_rank integer not null check (previous_rank > 0),
    current_points numeric(10,2) not null default 0,
    previous_points numeric(10,2) not null default 0,
    rank_since timestamptz not null default now(),
    longest_hold_seconds bigint not null default 0 check (longest_hold_seconds >= 0),
    longest_hold_rank integer,
    best_rank integer not null check (best_rank > 0),
    hold_milestone_days integer not null default 0 check (hold_milestone_days >= 0),
    week_key text not null,
    week_start_points numeric(10,2) not null default 0,
    week_start_rank integer not null check (week_start_rank > 0),
    growth_streak_weeks integer not null default 0 check (growth_streak_weeks >= 0),
    last_rank_delta integer not null default 0,
    last_point_delta numeric(10,2) not null default 0,
    last_movement_at timestamptz,
    updated_at timestamptz not null default now(),
    unique (scope_key, student_id)
);

create index if not exists idx_leaderboard_rank_state_scope_rank
    on public.leaderboard_rank_state (scope_key, current_rank);

create table if not exists public.leaderboard_events (
    id uuid primary key default gen_random_uuid(),
    event_key text not null unique,
    scope_key text not null default 'college',
    event_type text not null,
    student_id uuid references public.students(id) on delete set null,
    target_student_id uuid references public.students(id) on delete set null,
    rank_from integer,
    rank_to integer,
    points numeric(10,2) not null default 0,
    point_delta numeric(10,2) not null default 0,
    message text not null check (char_length(message) between 1 and 500),
    broadcast boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists idx_leaderboard_events_scope_created
    on public.leaderboard_events (scope_key, created_at desc);

alter table public.leaderboard_rank_state enable row level security;
alter table public.leaderboard_events enable row level security;

revoke all on public.leaderboard_rank_state from anon, authenticated;
revoke all on public.leaderboard_events from anon, authenticated;

comment on table public.leaderboard_rank_state is
'Server-owned college leaderboard state used for rank movement, hold timers, weekly growth, rival pressure and personal records. Baseline starts when ranking-chaos-v1 first runs; previous hold history is intentionally not backfilled.';

comment on table public.leaderboard_events is
'Server-owned deduplicated leaderboard competition events. Broadcast events create in-app notifications and opted-in web push.';
