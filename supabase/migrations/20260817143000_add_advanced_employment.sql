ALTER TABLE students
ADD COLUMN IF NOT EXISTS org_type TEXT CHECK (org_type IN ('Startup', 'MNC', 'PSU', 'Govt', 'SMB', 'Other')),
ADD COLUMN IF NOT EXISTS current_ctc NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS company_address TEXT;
