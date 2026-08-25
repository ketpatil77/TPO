create or replace function public.profile_completion_report(filter_branch text default null, filter_year text default null)
returns table (
  prn text, name text, branch text, class text, year text, profile_active boolean,
  email text, phone text, ssc_marks numeric, hsc_marks numeric, cgpa_overall numeric,
  backlogs_semesterwise jsonb, activities text, resume_url text, avatar_path text,
  is_employed boolean, employment_type text, org_type text, company_name text, company_address text,
  has_skills boolean, has_internship boolean, has_certificate boolean, has_project boolean, has_research boolean
)
language sql stable security invoker set search_path = public
as $$
  select r.prn, r.name, r.branch, r.class, r.year, s.id is not null,
    s.email, s.phone, s.ssc_marks, s.hsc_marks, s.cgpa_overall,
    s.backlogs_semesterwise, s.activities, s.resume_url, s.avatar_path,
    s.is_employed, s.employment_type, s.org_type, s.company_name, s.company_address,
    exists(select 1 from public.student_skills x where x.student_id=s.id and nullif(btrim(x.skill),'') is not null),
    exists(select 1 from public.internships x where x.student_id=s.id),
    exists(select 1 from public.certificates x where x.student_id=s.id),
    exists(select 1 from public.student_projects x where x.student_id=s.id),
    exists(select 1 from public.research_papers x where x.student_id=s.id)
  from public.roster r
  left join public.students s on s.prn=r.prn
  where (filter_branch is null or r.branch=filter_branch)
    and (filter_year is null or r.year=filter_year)
  order by r.name, r.prn;
$$;

revoke all on function public.profile_completion_report(text,text) from public, anon, authenticated;
grant execute on function public.profile_completion_report(text,text) to service_role;

;
