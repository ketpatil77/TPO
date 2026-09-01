create table public.student_competitions (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students(id) on delete cascade,
    title text not null check (char_length(title) between 2 and 200),
    organizer text not null check (char_length(organizer) between 2 and 200),
    competition_type text not null check (competition_type in (
        'Research Convention / Aavishkar','Hackathon','Ideathon','Innovation / Project Competition',
        'Coding / Programming Contest','Data / AI Challenge','Cybersecurity / CTF','Robotics Competition',
        'Paper Presentation','Technical Quiz','Design / CAD Challenge','Case Study Competition',
        'Business Plan / Startup Pitch','Other Technical / Academic Competition'
    )),
    level text not null check (level in (
        'Department','Institute / College','Inter-College','District','Zonal','University','Inter-University',
        'Regional','State','National','International','Open / Online'
    )),
    result_status text not null check (result_status in (
        'Participated','Shortlisted / Selected','Finalist','Rank / Position','Runner-up','Winner','Special Award'
    )),
    position_text text check (position_text is null or char_length(position_text) <= 80),
    participated_on date not null check (participated_on <= current_date),
    team_type text not null check (team_type in ('Individual','Team')),
    team_size smallint not null default 1 check (team_size between 1 and 25),
    project_title text check (project_title is null or char_length(project_title) <= 250),
    source_url text check (source_url is null or source_url ~ '^https://'),
    proof_url text check (proof_url is null or proof_url ~ '^https://'),
    notes text check (notes is null or char_length(notes) <= 1500),
    verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
    verified_by uuid,
    verified_at timestamptz,
    verification_note text check (verification_note is null or char_length(verification_note) <= 1000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint student_competitions_team_size check ((team_type = 'Individual' and team_size = 1) or (team_type = 'Team' and team_size >= 2)),
    constraint student_competitions_rank_text check (result_status <> 'Rank / Position' or position_text is not null)
);

create index student_competitions_student_date_idx on public.student_competitions (student_id, participated_on desc);
create index student_competitions_verification_idx on public.student_competitions (verification_status, level, result_status);
create unique index student_competitions_no_duplicate_idx on public.student_competitions (student_id, lower(title), participated_on, level);

alter table public.student_competitions enable row level security;
revoke all on table public.student_competitions from anon, authenticated;
grant select, insert, update, delete on table public.student_competitions to authenticated;

create policy "Admins manage student_competitions"
on public.student_competitions
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
