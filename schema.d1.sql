-- Cloudflare D1 (SQLite) Translated Schema for TPO Placement Portal

CREATE TABLE IF NOT EXISTS roster (
    id TEXT PRIMARY KEY,
    prn TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    dob TEXT NOT NULL,
    branch TEXT,
    class TEXT,
    year TEXT
);
CREATE INDEX IF NOT EXISTS idx_roster_prn ON roster(prn);

CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    prn TEXT UNIQUE NOT NULL REFERENCES roster(prn) ON DELETE CASCADE,
    name TEXT,
    email TEXT,
    phone TEXT,
    branch TEXT,
    class TEXT,
    year TEXT,
    ssc_marks REAL,
    hsc_marks REAL,
    is_employed INTEGER DEFAULT 0,
    employment_type TEXT CHECK (employment_type IN ('Govt', 'Private')),
    company_name TEXT,
    hr_name TEXT,
    hr_number TEXT,
    org_type TEXT CHECK (org_type IN ('Startup', 'MNC', 'PSU', 'Govt', 'SMB', 'Other')),
    current_ctc REAL,
    company_address TEXT,
    cgpa_overall REAL,
    cgpa_semesterwise TEXT DEFAULT '{}',
    backlogs_semesterwise TEXT DEFAULT '{}',
    activities TEXT,
    resume_url TEXT,
    avatar_path TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_students_prn ON students(prn);

CREATE TABLE IF NOT EXISTS internships (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    mode TEXT CHECK (mode IN ('online', 'offline')) DEFAULT 'offline'
);
CREATE INDEX IF NOT EXISTS idx_internships_student_id ON internships(student_id);

CREATE TABLE IF NOT EXISTS certificates (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    issuer TEXT NOT NULL,
    date TEXT NOT NULL,
    mode TEXT CHECK (mode IN ('online', 'offline')) DEFAULT 'online',
    evidence_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_certificates_student_id ON certificates(student_id);

CREATE TABLE IF NOT EXISTS student_projects (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    technologies TEXT,
    project_url TEXT,
    repository_url TEXT,
    completed_on TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_student_projects_student_id ON student_projects(student_id);

CREATE TABLE IF NOT EXISTS research_papers (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    authors TEXT NOT NULL,
    publication TEXT NOT NULL,
    abstract TEXT NOT NULL,
    doi_url TEXT,
    paper_url TEXT,
    published_on TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_papers_student_id ON research_papers(student_id);

CREATE TABLE IF NOT EXISTS diploma (
    id TEXT PRIMARY KEY,
    student_id TEXT UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    institute TEXT,
    branch TEXT NOT NULL,
    year_of_passing INTEGER NOT NULL,
    percentage_or_cgpa TEXT
);
CREATE INDEX IF NOT EXISTS idx_diploma_student_id ON diploma(student_id);

CREATE TABLE IF NOT EXISTS student_skills (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,
    proficiency_level TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_student_skills_student_id ON student_skills(student_id);

CREATE TABLE IF NOT EXISTS placement_drives (
    id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    description TEXT,
    ctc REAL,
    location TEXT,
    drive_date TEXT,
    status TEXT DEFAULT 'upcoming',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drive_criteria (
    id TEXT PRIMARY KEY,
    drive_id TEXT NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
    min_cgpa REAL,
    min_ssc_marks REAL,
    min_hsc_marks REAL,
    allowed_branches TEXT,
    max_backlogs INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drive_matches (
    id TEXT PRIMARY KEY,
    drive_id TEXT NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    matched_skills TEXT,
    score REAL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shortlists (
    id TEXT PRIMARY KEY,
    drive_id TEXT NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'shortlisted',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drive_applications (
    id TEXT PRIMARY KEY,
    drive_id TEXT NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    applied_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    target_table TEXT,
    target_id TEXT,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'tpc', 'observer')),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY,
    prn_or_email TEXT NOT NULL,
    success INTEGER NOT NULL,
    ip_address TEXT,
    attempted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS correction_requests (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_filters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filter_criteria TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    scheduled_at TEXT
);

CREATE TABLE IF NOT EXISTS interviews (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    round_name TEXT NOT NULL,
    scheduled_at TEXT,
    status TEXT DEFAULT 'scheduled'
);

CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    ctc REAL NOT NULL,
    offered_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    event_type TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT
);

CREATE TABLE IF NOT EXISTS notification_reads (
    id TEXT PRIMARY KEY,
    notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    read_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    batch_name TEXT NOT NULL,
    records_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dob_corrections (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    old_dob TEXT,
    new_dob TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_push_subscriptions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_competitions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rank TEXT,
    year TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_profile_declarations (
    id TEXT PRIMARY KEY,
    student_id TEXT UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    is_declared INTEGER DEFAULT 0,
    declared_at TEXT
);

CREATE TABLE IF NOT EXISTS student_free_learning_progress (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_key TEXT NOT NULL,
    progress_percentage INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_activity_log (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    changed_fields TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_broadcasts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_group TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_broadcast_deliveries (
    id TEXT PRIMARY KEY,
    broadcast_id TEXT NOT NULL REFERENCES notification_broadcasts(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    delivered_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leaderboard_rank_state (
    id TEXT PRIMARY KEY,
    student_id TEXT UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    points INTEGER DEFAULT 0,
    rank INTEGER,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leaderboard_events (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    points_awarded INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
