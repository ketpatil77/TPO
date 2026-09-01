alter table public.student_competitions
    add column if not exists verified_role text
    check (verified_role is null or verified_role in ('TPO','TPC'));

create index if not exists student_competitions_verified_role_idx
    on public.student_competitions (verified_role, verification_status);
