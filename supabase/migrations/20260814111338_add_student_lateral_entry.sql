alter table public.students
add column if not exists lateral_entry boolean not null default false;
comment on column public.students.lateral_entry is
'True when student entered degree through diploma/lateral entry; Semester 1 and 2 CGPA remain zero.';
