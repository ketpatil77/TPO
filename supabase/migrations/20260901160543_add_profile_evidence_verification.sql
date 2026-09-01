alter table public.internships add column if not exists verification_status text not null default 'pending';
alter table public.internships add column if not exists verified_by uuid;
alter table public.internships add column if not exists verified_role text;
alter table public.internships add column if not exists verified_at timestamptz;
alter table public.internships add column if not exists verification_note text;

alter table public.certificates add column if not exists verification_status text not null default 'pending';
alter table public.certificates add column if not exists verified_by uuid;
alter table public.certificates add column if not exists verified_role text;
alter table public.certificates add column if not exists verified_at timestamptz;
alter table public.certificates add column if not exists verification_note text;

alter table public.student_projects add column if not exists verification_status text not null default 'pending';
alter table public.student_projects add column if not exists verified_by uuid;
alter table public.student_projects add column if not exists verified_role text;
alter table public.student_projects add column if not exists verified_at timestamptz;
alter table public.student_projects add column if not exists verification_note text;

alter table public.research_papers add column if not exists verification_status text not null default 'pending';
alter table public.research_papers add column if not exists verified_by uuid;
alter table public.research_papers add column if not exists verified_role text;
alter table public.research_papers add column if not exists verified_at timestamptz;
alter table public.research_papers add column if not exists verification_note text;

alter table public.student_skills add column if not exists verification_status text not null default 'pending';
alter table public.student_skills add column if not exists verified_by uuid;
alter table public.student_skills add column if not exists verified_role text;
alter table public.student_skills add column if not exists verified_at timestamptz;
alter table public.student_skills add column if not exists verification_note text;

alter table public.student_competitions add column if not exists verified_role text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='internships_verification_status_check') then
    alter table public.internships add constraint internships_verification_status_check check (verification_status in ('pending','verified','rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname='certificates_verification_status_check') then
    alter table public.certificates add constraint certificates_verification_status_check check (verification_status in ('pending','verified','rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname='student_projects_verification_status_check') then
    alter table public.student_projects add constraint student_projects_verification_status_check check (verification_status in ('pending','verified','rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname='research_papers_verification_status_check') then
    alter table public.research_papers add constraint research_papers_verification_status_check check (verification_status in ('pending','verified','rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname='student_skills_verification_status_check') then
    alter table public.student_skills add constraint student_skills_verification_status_check check (verification_status in ('pending','verified','rejected'));
  end if;
end $$;

create or replace function public.reset_profile_evidence_verification()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - array['verification_status','verified_by','verified_role','verified_at','verification_note'])
     is distinct from
     (to_jsonb(old) - array['verification_status','verified_by','verified_role','verified_at','verification_note']) then
    new.verification_status := 'pending';
    new.verified_by := null;
    new.verified_role := null;
    new.verified_at := null;
    new.verification_note := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_internships_reset_verification on public.internships;
create trigger trg_internships_reset_verification before update on public.internships for each row execute function public.reset_profile_evidence_verification();
drop trigger if exists trg_certificates_reset_verification on public.certificates;
create trigger trg_certificates_reset_verification before update on public.certificates for each row execute function public.reset_profile_evidence_verification();
drop trigger if exists trg_projects_reset_verification on public.student_projects;
create trigger trg_projects_reset_verification before update on public.student_projects for each row execute function public.reset_profile_evidence_verification();
drop trigger if exists trg_research_reset_verification on public.research_papers;
create trigger trg_research_reset_verification before update on public.research_papers for each row execute function public.reset_profile_evidence_verification();
drop trigger if exists trg_skills_reset_verification on public.student_skills;
create trigger trg_skills_reset_verification before update on public.student_skills for each row execute function public.reset_profile_evidence_verification();

create index if not exists internships_verification_idx on public.internships(verification_status, student_id);
create index if not exists certificates_verification_idx on public.certificates(verification_status, student_id);
create index if not exists student_projects_verification_idx on public.student_projects(verification_status, student_id);
create index if not exists research_papers_verification_idx on public.research_papers(verification_status, student_id);
create index if not exists student_skills_verification_idx on public.student_skills(verification_status, student_id);
