ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS branches JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN students.email IS 'Student-provided contact email, visible to authenticated placement staff.';
COMMENT ON COLUMN students.phone IS 'Student-provided contact phone, visible to authenticated placement staff.';
COMMENT ON COLUMN notifications.branches IS 'Target branch codes; empty array means all branches.';
