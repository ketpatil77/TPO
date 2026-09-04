create index if not exists idx_leaderboard_rank_state_student
    on public.leaderboard_rank_state (student_id);

create index if not exists idx_leaderboard_events_student
    on public.leaderboard_events (student_id);

create index if not exists idx_leaderboard_events_target_student
    on public.leaderboard_events (target_student_id);
