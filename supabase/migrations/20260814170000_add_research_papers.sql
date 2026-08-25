create table if not exists public.research_papers (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 250),
  authors text not null check (char_length(authors) between 1 and 1000),
  publication text not null check (char_length(publication) between 1 and 250),
  abstract text not null check (char_length(abstract) between 1 and 3000),
  doi_url text,
  paper_url text,
  published_on date not null check (published_on <= current_date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_research_papers_student_id on public.research_papers(student_id);
alter table public.research_papers enable row level security;
drop policy if exists "Admins manage research_papers" on public.research_papers;
create policy "Admins manage research_papers" on public.research_papers
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.research_papers from anon;
grant select, insert, update, delete on public.research_papers to authenticated, service_role;
