DROP TRIGGER IF EXISTS trg_student_activity_student_skills ON public.student_skills;

CREATE OR REPLACE FUNCTION public.replace_student_skills(target_student_id uuid, new_skills text[])
RETURNS SETOF public.student_skills
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  old_skills text[];
  desired_skills text[];
  added_count integer;
  removed_count integer;
  st record;
BEGIN
  SELECT COALESCE(array_agg(skill ORDER BY skill), ARRAY[]::text[])
    INTO old_skills
    FROM public.student_skills
   WHERE student_id = target_student_id;

  SELECT COALESCE(array_agg(skill ORDER BY skill), ARRAY[]::text[])
    INTO desired_skills
    FROM (
      SELECT DISTINCT btrim(value) AS skill
      FROM unnest(COALESCE(new_skills, ARRAY[]::text[])) AS value
      WHERE btrim(value) <> ''
    ) normalized;

  IF old_skills = desired_skills THEN
    RETURN QUERY
      SELECT * FROM public.student_skills
       WHERE student_id = target_student_id
       ORDER BY skill;
    RETURN;
  END IF;

  SELECT count(*) INTO added_count
    FROM unnest(desired_skills) skill
   WHERE NOT (skill = ANY(old_skills));
  SELECT count(*) INTO removed_count
    FROM unnest(old_skills) skill
   WHERE NOT (skill = ANY(desired_skills));

  DELETE FROM public.student_skills WHERE student_id = target_student_id;
  INSERT INTO public.student_skills (student_id, skill)
  SELECT target_student_id, skill FROM unnest(desired_skills) skill;

  SELECT s.prn,
         COALESCE(s.name, r.name) AS student_name,
         COALESCE(s.branch, r.branch) AS branch,
         COALESCE(s.class, r.class) AS class,
         COALESCE(s.year, r.year) AS year
    INTO st
    FROM public.students s
    LEFT JOIN public.roster r ON r.prn = s.prn
   WHERE s.id = target_student_id;

  INSERT INTO public.student_activity_log(
      student_id, prn, student_name, branch, class, year,
      action, category, target_table, target_id, changed_fields,
      old_values, new_values, summary, created_at
  ) VALUES (
      target_student_id,
      st.prn,
      COALESCE(st.student_name, 'Student'),
      st.branch,
      st.class,
      st.year,
      'updated',
      'Skills',
      'student_skills',
      target_student_id::text,
      ARRAY['skills']::text[],
      jsonb_build_object('skills', old_skills),
      jsonb_build_object('skills', desired_skills),
      'Skills updated' || CASE
          WHEN added_count > 0 OR removed_count > 0
          THEN format(' (%s added, %s removed)', added_count, removed_count)
          ELSE ''
      END,
      now()
  );

  RETURN QUERY
    SELECT * FROM public.student_skills
     WHERE student_id = target_student_id
     ORDER BY skill;
END;
$function$;

WITH raw AS (
  DELETE FROM public.student_activity_log
   WHERE target_table = 'student_skills'
     AND action IN ('created','deleted')
  RETURNING *
)
INSERT INTO public.student_activity_log(
    student_id, prn, student_name, branch, class, year,
    action, category, target_table, target_id, changed_fields,
    old_values, new_values, summary, created_at
)
SELECT student_id,
       max(prn),
       max(student_name),
       max(branch),
       max(class),
       max(year),
       'updated',
       'Skills',
       'student_skills',
       student_id::text,
       ARRAY['skills']::text[],
       '{}'::jsonb,
       '{}'::jsonb,
       'Skills updated',
       created_at
FROM raw
GROUP BY student_id, created_at;
