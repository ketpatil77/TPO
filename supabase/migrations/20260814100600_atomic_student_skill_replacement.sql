create or replace function public.replace_student_skills(target_student_id uuid, new_skills text[])
returns setof public.student_skills
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.student_skills where student_id = target_student_id;
  return query
    insert into public.student_skills (student_id, skill)
    select target_student_id, value
    from unnest(coalesce(new_skills, array[]::text[])) as value
    returning *;
end;
$$;
revoke all on function public.replace_student_skills(uuid, text[]) from public, anon, authenticated;
grant execute on function public.replace_student_skills(uuid, text[]) to service_role;
