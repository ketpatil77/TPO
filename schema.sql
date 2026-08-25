-- Enable UUID Extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Roster Table (Preloaded by Admin)
CREATE TABLE IF NOT EXISTS roster (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prn TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    dob DATE NOT NULL,
    branch TEXT,
    class TEXT,
    year TEXT
);

-- Index on PRN for fast authentication lookups
CREATE INDEX IF NOT EXISTS idx_roster_prn ON roster(prn);

-- 2. Students Table (Created on first login / student profile)
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prn TEXT UNIQUE NOT NULL REFERENCES roster(prn) ON DELETE CASCADE,
    name TEXT,
    email TEXT,
    phone TEXT,
    branch TEXT,
    class TEXT,
    year TEXT,
    ssc_marks NUMERIC(5, 2),
    hsc_marks NUMERIC(5, 2),
    is_employed BOOLEAN DEFAULT false,
    employment_type TEXT CHECK (employment_type IN ('Govt', 'Private')),
    company_name TEXT,
    hr_name TEXT,
    hr_number TEXT,
    org_type TEXT CHECK (org_type IN ('Startup', 'MNC', 'PSU', 'Govt', 'SMB', 'Other')),
    current_ctc NUMERIC(5, 2),
    company_address TEXT,
    cgpa_overall NUMERIC(4, 2),
    cgpa_semesterwise JSONB DEFAULT '{}'::jsonb,
    backlogs_semesterwise JSONB DEFAULT '{}'::jsonb,
    activities TEXT,
    resume_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_prn ON students(prn);

-- 3. Internships Table
CREATE TABLE IF NOT EXISTS internships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    mode TEXT CHECK (mode IN ('online', 'offline')) DEFAULT 'offline'
);

CREATE INDEX IF NOT EXISTS idx_internships_student_id ON internships(student_id);

-- 4. Certificates Table
CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    issuer TEXT NOT NULL,
    date DATE NOT NULL,
    mode TEXT CHECK (mode IN ('online', 'offline')) DEFAULT 'online'
);

CREATE INDEX IF NOT EXISTS idx_certificates_student_id ON certificates(student_id);

-- 5. Student Projects Table
CREATE TABLE IF NOT EXISTS student_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    technologies TEXT,
    project_url TEXT,
    repository_url TEXT,
    completed_on DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_projects_student_id ON student_projects(student_id);

CREATE TABLE IF NOT EXISTS research_papers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title TEXT NOT NULL, authors TEXT NOT NULL, publication TEXT NOT NULL,
    abstract TEXT NOT NULL, doi_url TEXT, paper_url TEXT,
    published_on DATE NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_research_papers_student_id ON research_papers(student_id);

-- 6. Diploma Table (Optional - Lateral entry / diploma students)
CREATE TABLE IF NOT EXISTS diploma (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    institute TEXT NOT NULL,
    branch TEXT NOT NULL,
    year_of_passing TEXT NOT NULL,
    percentage_or_cgpa TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diploma_student_id ON diploma(student_id);

-- 6. Audit Log Table (Part 2 Admin Action Tracking)
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- Production RLS policies and added feature tables live in supabase/migrations.
ALTER TABLE roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE internships ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE diploma ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Sample Data for Roster Preloading
INSERT INTO roster (prn, name, dob, branch, class, year) VALUES
('24053651251515', 'Rahul Sharma', '2003-07-31', 'Computer Engineering', 'BE-A', 'Final Year'),
('24053651251516', 'Priya Patel', '2004-01-15', 'Information Technology', 'BE-B', 'Final Year'),
('24053651251517', 'Aman Verma', '2003-11-22', 'Electronics & Telecom', 'BE-A', 'Final Year')
ON CONFLICT (prn) DO NOTHING;
