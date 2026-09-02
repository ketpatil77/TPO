alter table public.students
  add column if not exists github_url text,
  add column if not exists portfolio_url text;

comment on column public.students.github_url is 'Student GitHub profile URL';
comment on column public.students.portfolio_url is 'Student portfolio website URL';
