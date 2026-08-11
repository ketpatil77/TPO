-- Keep login throttling records server-only while making denial explicit.
drop policy if exists "No client access to login attempts" on public.login_attempts;
create policy "No client access to login attempts"
on public.login_attempts
for all
to anon, authenticated
using (false)
with check (false);

-- Index foreign-key columns used by joins and cascading updates/deletes.
create index if not exists idx_drive_criteria_confirmed_by
  on public.drive_criteria (confirmed_by);

create index if not exists idx_drive_matches_student_id
  on public.drive_matches (student_id);

create index if not exists idx_placement_drives_created_by
  on public.placement_drives (created_by);

create index if not exists idx_shortlists_student_id
  on public.shortlists (student_id);

create index if not exists idx_shortlists_updated_by
  on public.shortlists (updated_by);
