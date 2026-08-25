ALTER TABLE students
ADD COLUMN IF NOT EXISTS backlogs_semesterwise JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN students.backlogs_semesterwise IS
'Current uncleared backlog count for each semester, keyed sem1 through sem8.';
