-- System audit hardening: canonical roster assignments, safer trigger functions,
-- and enough import history to restore student assignments on undo.

-- Canonicalize legacy year casing before enforcing the database contract.
UPDATE public.roster
SET year = CASE lower(btrim(year))
    WHEN 'first year' THEN 'First Year'
    WHEN 'second year' THEN 'Second Year'
    WHEN 'third year' THEN 'Third Year'
    WHEN 'final year' THEN 'Final Year'
    ELSE year
END
WHERE lower(btrim(year)) IN ('first year','second year','third year','final year');

-- Roster assignment is authoritative. Repair any legacy profile drift.
UPDATE public.students AS s
SET branch = r.branch,
    class = r.class,
    year = r.year
FROM public.roster AS r
WHERE s.prn = r.prn
  AND (s.branch IS DISTINCT FROM r.branch
       OR s.class IS DISTINCT FROM r.class
       OR s.year IS DISTINCT FROM r.year);

ALTER TABLE public.roster
    ALTER COLUMN branch SET NOT NULL,
    ALTER COLUMN class SET NOT NULL,
    ALTER COLUMN year SET NOT NULL;

ALTER TABLE public.roster DROP CONSTRAINT IF EXISTS roster_prn_format_check;
ALTER TABLE public.roster ADD CONSTRAINT roster_prn_format_check
    CHECK (prn ~ '^[0-9]{10,20}$');

ALTER TABLE public.roster DROP CONSTRAINT IF EXISTS roster_name_length_check;
ALTER TABLE public.roster ADD CONSTRAINT roster_name_length_check
    CHECK (length(btrim(name)) BETWEEN 2 AND 150);

ALTER TABLE public.roster DROP CONSTRAINT IF EXISTS roster_branch_valid_check;
ALTER TABLE public.roster ADD CONSTRAINT roster_branch_valid_check
    CHECK (branch IN ('AIML','CT','EE','ME','CE','E&C'));

ALTER TABLE public.roster DROP CONSTRAINT IF EXISTS roster_class_format_check;
ALTER TABLE public.roster ADD CONSTRAINT roster_class_format_check
    CHECK (class ~ '^[A-Za-z0-9 -]{1,20}$');

ALTER TABLE public.roster DROP CONSTRAINT IF EXISTS roster_year_valid_check;
ALTER TABLE public.roster ADD CONSTRAINT roster_year_valid_check
    CHECK (year IN ('First Year','Second Year','Third Year','Final Year'));

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_prn_format_check;
ALTER TABLE public.students ADD CONSTRAINT students_prn_format_check
    CHECK (prn ~ '^[0-9]{10,20}$');

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_branch_valid_check;
ALTER TABLE public.students ADD CONSTRAINT students_branch_valid_check
    CHECK (branch IS NULL OR branch IN ('AIML','CT','EE','ME','CE','E&C'));

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_class_format_check;
ALTER TABLE public.students ADD CONSTRAINT students_class_format_check
    CHECK (class IS NULL OR class ~ '^[A-Za-z0-9 -]{1,20}$');

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_year_valid_check;
ALTER TABLE public.students ADD CONSTRAINT students_year_valid_check
    CHECK (year IS NULL OR year IN ('First Year','Second Year','Third Year','Final Year'));

ALTER TABLE public.import_batches
    ADD COLUMN IF NOT EXISTS previous_student_rows JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Trigger-only helper functions should have a fixed search path.
ALTER FUNCTION public.reset_profile_evidence_verification() SET search_path = public;
ALTER FUNCTION public.reset_academic_verification_on_score_change() SET search_path = public;

-- This SECURITY DEFINER function is invoked by database triggers, never by public RPC.
REVOKE EXECUTE ON FUNCTION public.log_student_activity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_student_activity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_student_activity() FROM authenticated;
