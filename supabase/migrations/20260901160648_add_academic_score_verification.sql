alter table public.students add column if not exists academic_verification_status text not null default 'pending';
alter table public.students add column if not exists academic_verified_by uuid;
alter table public.students add column if not exists academic_verified_role text;
alter table public.students add column if not exists academic_verified_at timestamptz;
alter table public.students add column if not exists academic_verification_note text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='students_academic_verification_status_check') then
    alter table public.students add constraint students_academic_verification_status_check check (academic_verification_status in ('pending','verified','rejected'));
  end if;
end $$;

create or replace function public.reset_academic_verification_on_score_change()
returns trigger language plpgsql as $$
begin
  if new.cgpa_overall is distinct from old.cgpa_overall
     or new.cgpa_semesterwise is distinct from old.cgpa_semesterwise
     or new.ssc_marks is distinct from old.ssc_marks
     or new.hsc_marks is distinct from old.hsc_marks then
    new.academic_verification_status := 'pending';
    new.academic_verified_by := null;
    new.academic_verified_role := null;
    new.academic_verified_at := null;
    new.academic_verification_note := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_students_reset_academic_verification on public.students;
create trigger trg_students_reset_academic_verification before update on public.students for each row execute function public.reset_academic_verification_on_score_change();
create index if not exists students_academic_verification_idx on public.students(academic_verification_status, branch, year);
