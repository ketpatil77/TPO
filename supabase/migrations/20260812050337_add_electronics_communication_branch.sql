alter table public.profiles drop constraint if exists profiles_department_check;
alter table public.profiles
  add constraint profiles_department_check
  check (department is null or department in ('AIML', 'CT', 'EE', 'ME', 'CE', 'E&C'));
update public.roster
set branch = 'E&C'
where lower(trim(branch)) in (
  'e&c', 'e and c', 'ec', 'e&tc', 'entc',
  'electronics & communication', 'electronics and communication',
  'electronics & communication engineering', 'electronics and communication engineering'
);
update public.students
set branch = 'E&C'
where lower(trim(branch)) in (
  'e&c', 'e and c', 'ec', 'e&tc', 'entc',
  'electronics & communication', 'electronics and communication',
  'electronics & communication engineering', 'electronics and communication engineering'
);
