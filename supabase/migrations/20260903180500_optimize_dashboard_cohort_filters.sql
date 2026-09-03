create index if not exists students_branch_year_idx on public.students(branch, year);
create index if not exists roster_branch_year_name_idx on public.roster(branch, year, name);
create index if not exists notifications_audience_created_idx on public.notifications(audience, created_at desc);
