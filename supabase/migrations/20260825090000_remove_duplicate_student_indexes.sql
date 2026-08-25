-- Keep the original *_student_id indexes and remove redundant equivalents.
DROP INDEX IF EXISTS public.idx_certificates_student;
DROP INDEX IF EXISTS public.idx_internships_student;
DROP INDEX IF EXISTS public.idx_student_projects_student;
