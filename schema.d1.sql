-- Cloudflare D1 Complete Schema for TPO Placement Portal

DROP TABLE IF EXISTS profiles;
CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    role TEXT,
    status TEXT,
    created_at TEXT,
    department TEXT,
    avatar_path TEXT,
    display_name TEXT,
    last_login_at TEXT,
    session_version REAL
);
CREATE INDEX IF NOT EXISTS idx_profiles_id ON profiles(id);

DROP TABLE IF EXISTS roster;
CREATE TABLE roster (
    id TEXT PRIMARY KEY,
    prn TEXT,
    name TEXT,
    dob TEXT,
    branch TEXT,
    class TEXT,
    year TEXT
);
CREATE INDEX IF NOT EXISTS idx_roster_id ON roster(id);

DROP TABLE IF EXISTS placement_drives;
CREATE TABLE placement_drives (
    id TEXT PRIMARY KEY,
    company_name TEXT,
    job_title TEXT,
    description TEXT,
    ctc TEXT,
    location TEXT,
    drive_date TEXT,
    status TEXT,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_placement_drives_id ON placement_drives(id);

DROP TABLE IF EXISTS audit_log;
CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    action TEXT,
    target_table TEXT,
    target_id TEXT,
    details TEXT,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_log_id ON audit_log(id);

DROP TABLE IF EXISTS login_attempts;
CREATE TABLE login_attempts (
    id TEXT PRIMARY KEY,
    identifier_hash TEXT,
    ip_hash TEXT,
    failures REAL,
    locked_until TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_id ON login_attempts(id);

DROP TABLE IF EXISTS saved_filters;
CREATE TABLE saved_filters (
    id TEXT PRIMARY KEY,
    name TEXT,
    filter_criteria TEXT,
    created_by TEXT,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_saved_filters_id ON saved_filters(id);

DROP TABLE IF EXISTS assessments;
CREATE TABLE assessments (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    type TEXT,
    title TEXT,
    score REAL,
    max_score REAL,
    attended_on TEXT,
    notes TEXT,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_assessments_id ON assessments(id);

DROP TABLE IF EXISTS calendar_events;
CREATE TABLE calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT,
    event_type TEXT,
    start_time TEXT,
    end_time TEXT
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_id ON calendar_events(id);

DROP TABLE IF EXISTS import_batches;
CREATE TABLE import_batches (
    id TEXT PRIMARY KEY,
    created_by TEXT,
    file_name TEXT,
    status TEXT,
    total_count REAL,
    added_count REAL,
    updated_count REAL,
    failed_count REAL,
    inserted_prns TEXT,
    previous_rows TEXT,
    errors TEXT,
    created_at TEXT,
    undone_at TEXT,
    previous_student_rows TEXT
);
CREATE INDEX IF NOT EXISTS idx_import_batches_id ON import_batches(id);

DROP TABLE IF EXISTS notification_broadcasts;
CREATE TABLE notification_broadcasts (
    id TEXT PRIMARY KEY,
    campaign_key TEXT,
    status TEXT,
    result TEXT,
    created_at TEXT,
    completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notification_broadcasts_id ON notification_broadcasts(id);

DROP TABLE IF EXISTS students;
CREATE TABLE students (
    id TEXT PRIMARY KEY,
    prn TEXT,
    name TEXT,
    branch TEXT,
    class TEXT,
    year TEXT,
    cgpa_overall REAL,
    cgpa_semesterwise TEXT,
    activities TEXT,
    resume_url TEXT,
    created_at TEXT,
    updated_at TEXT,
    avatar_path TEXT,
    backlogs_semesterwise TEXT,
    email TEXT,
    phone TEXT,
    lateral_entry INTEGER DEFAULT 0,
    ssc_marks TEXT,
    hsc_marks TEXT,
    is_employed INTEGER DEFAULT 0,
    employment_type TEXT,
    company_name TEXT,
    hr_name TEXT,
    hr_number TEXT,
    org_type TEXT,
    current_ctc TEXT,
    company_address TEXT,
    academic_verification_status TEXT,
    academic_verified_by TEXT,
    academic_verified_role TEXT,
    academic_verified_at TEXT,
    academic_verification_note TEXT,
    github_url TEXT,
    portfolio_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_students_id ON students(id);

DROP TABLE IF EXISTS internships;
CREATE TABLE internships (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    company TEXT,
    role TEXT,
    start_date TEXT,
    end_date TEXT,
    mode TEXT,
    verification_status TEXT,
    verified_by TEXT,
    verified_role TEXT,
    verified_at TEXT,
    verification_note TEXT,
    evidence_path TEXT,
    evidence_mime TEXT,
    evidence_bytes REAL,
    evidence_sha256 TEXT,
    evidence_uploaded_at TEXT,
    proof_missing_since TEXT,
    proof_deadline TEXT,
    created_at TEXT,
    updated_at TEXT,
    proof_notice_sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_internships_id ON internships(id);

DROP TABLE IF EXISTS certificates;
CREATE TABLE certificates (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    name TEXT,
    issuer TEXT,
    date TEXT,
    mode TEXT,
    verification_status TEXT,
    verified_by TEXT,
    verified_role TEXT,
    verified_at TEXT,
    verification_note TEXT,
    evidence_path TEXT,
    evidence_mime TEXT,
    evidence_bytes REAL,
    evidence_sha256 TEXT,
    evidence_uploaded_at TEXT,
    proof_missing_since TEXT,
    proof_deadline TEXT,
    created_at TEXT,
    updated_at TEXT,
    proof_notice_sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_certificates_id ON certificates(id);

DROP TABLE IF EXISTS student_projects;
CREATE TABLE student_projects (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    title TEXT,
    summary TEXT,
    technologies TEXT,
    project_url TEXT,
    repository_url TEXT,
    completed_on TEXT,
    created_at TEXT,
    verification_status TEXT,
    verified_by TEXT,
    verified_role TEXT,
    verified_at TEXT,
    verification_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_projects_id ON student_projects(id);

DROP TABLE IF EXISTS research_papers;
CREATE TABLE research_papers (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    title TEXT,
    authors TEXT,
    publication TEXT,
    abstract TEXT,
    doi_url TEXT,
    paper_url TEXT,
    published_on TEXT,
    created_at TEXT,
    updated_at TEXT,
    verification_status TEXT,
    verified_by TEXT,
    verified_role TEXT,
    verified_at TEXT,
    verification_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_research_papers_id ON research_papers(id);

DROP TABLE IF EXISTS diploma;
CREATE TABLE diploma (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    institute TEXT,
    branch TEXT,
    year_of_passing TEXT,
    percentage_or_cgpa TEXT
);
CREATE INDEX IF NOT EXISTS idx_diploma_id ON diploma(id);

DROP TABLE IF EXISTS student_skills;
CREATE TABLE student_skills (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    skill TEXT,
    verification_status TEXT,
    verified_by TEXT,
    verified_role TEXT,
    verified_at TEXT,
    verification_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_skills_id ON student_skills(id);

DROP TABLE IF EXISTS correction_requests;
CREATE TABLE correction_requests (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    field_name TEXT,
    message TEXT,
    status TEXT,
    created_by TEXT,
    created_at TEXT,
    resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_correction_requests_id ON correction_requests(id);

DROP TABLE IF EXISTS notifications;
CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    audience TEXT,
    title TEXT,
    message TEXT,
    priority TEXT,
    read_at TEXT,
    created_at TEXT,
    expires_at TEXT,
    action_url TEXT,
    branches TEXT,
    campaign_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_id ON notifications(id);

DROP TABLE IF EXISTS interviews;
CREATE TABLE interviews (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    company_name TEXT,
    round_name TEXT,
    scheduled_at TEXT,
    status TEXT
);
CREATE INDEX IF NOT EXISTS idx_interviews_id ON interviews(id);

DROP TABLE IF EXISTS offers;
CREATE TABLE offers (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    company_name TEXT,
    job_title TEXT,
    ctc TEXT,
    offered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_offers_id ON offers(id);

DROP TABLE IF EXISTS dob_corrections;
CREATE TABLE dob_corrections (
    id TEXT PRIMARY KEY,
    prn TEXT,
    submitted_name TEXT,
    submitted_dob TEXT,
    department TEXT,
    status TEXT,
    created_at TEXT,
    processed_at TEXT,
    processed_by TEXT,
    name_mismatch INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_dob_corrections_id ON dob_corrections(id);

DROP TABLE IF EXISTS student_push_subscriptions;
CREATE TABLE student_push_subscriptions (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    endpoint TEXT,
    subscription TEXT,
    last_notified_at TEXT,
    last_error TEXT,
    created_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_push_subscriptions_id ON student_push_subscriptions(id);

DROP TABLE IF EXISTS student_competitions;
CREATE TABLE student_competitions (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    title TEXT,
    organizer TEXT,
    competition_type TEXT,
    level TEXT,
    result_status TEXT,
    position_text TEXT,
    participated_on TEXT,
    team_type TEXT,
    team_size REAL,
    project_title TEXT,
    source_url TEXT,
    proof_url TEXT,
    notes TEXT,
    verification_status TEXT,
    verified_by TEXT,
    verified_at TEXT,
    verification_note TEXT,
    created_at TEXT,
    updated_at TEXT,
    verified_role TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_competitions_id ON student_competitions(id);

DROP TABLE IF EXISTS student_profile_declarations;
CREATE TABLE student_profile_declarations (
    student_id TEXT PRIMARY KEY,
    no_certificates INTEGER DEFAULT 0,
    no_projects INTEGER DEFAULT 0,
    no_research INTEGER DEFAULT 0,
    no_internships INTEGER DEFAULT 0,
    no_competitions INTEGER DEFAULT 0,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_profile_declarations_student_id ON student_profile_declarations(student_id);

DROP TABLE IF EXISTS student_free_learning_progress;
CREATE TABLE student_free_learning_progress (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    resource_id REAL,
    state TEXT,
    updated_at TEXT,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_free_learning_progress_id ON student_free_learning_progress(id);

DROP TABLE IF EXISTS student_activity_log;
CREATE TABLE student_activity_log (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    prn TEXT,
    student_name TEXT,
    branch TEXT,
    class TEXT,
    year TEXT,
    action TEXT,
    category TEXT,
    target_table TEXT,
    target_id TEXT,
    changed_fields TEXT,
    old_values TEXT,
    new_values TEXT,
    summary TEXT,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_activity_log_id ON student_activity_log(id);

DROP TABLE IF EXISTS leaderboard_rank_state;
CREATE TABLE leaderboard_rank_state (
    id TEXT PRIMARY KEY,
    scope_key TEXT,
    student_id TEXT,
    current_rank REAL,
    previous_rank REAL,
    current_points REAL,
    previous_points REAL,
    rank_since TEXT,
    longest_hold_seconds REAL,
    longest_hold_rank REAL,
    best_rank REAL,
    hold_milestone_days REAL,
    week_key TEXT,
    week_start_points REAL,
    week_start_rank REAL,
    growth_streak_weeks REAL,
    last_rank_delta REAL,
    last_point_delta REAL,
    last_movement_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank_state_id ON leaderboard_rank_state(id);

DROP TABLE IF EXISTS leaderboard_events;
CREATE TABLE leaderboard_events (
    id TEXT PRIMARY KEY,
    event_key TEXT,
    scope_key TEXT,
    event_type TEXT,
    student_id TEXT,
    target_student_id TEXT,
    rank_from REAL,
    rank_to REAL,
    points REAL,
    point_delta REAL,
    message TEXT,
    broadcast INTEGER DEFAULT 0,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_events_id ON leaderboard_events(id);

DROP TABLE IF EXISTS drive_criteria;
CREATE TABLE drive_criteria (
    id TEXT PRIMARY KEY,
    drive_id TEXT,
    min_cgpa TEXT,
    min_ssc_marks TEXT,
    min_hsc_marks TEXT,
    allowed_branches TEXT,
    max_backlogs TEXT
);
CREATE INDEX IF NOT EXISTS idx_drive_criteria_id ON drive_criteria(id);

DROP TABLE IF EXISTS drive_matches;
CREATE TABLE drive_matches (
    id TEXT PRIMARY KEY,
    drive_id TEXT,
    student_id TEXT,
    matched_skills TEXT,
    score TEXT,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_drive_matches_id ON drive_matches(id);

DROP TABLE IF EXISTS shortlists;
CREATE TABLE shortlists (
    id TEXT PRIMARY KEY,
    drive_id TEXT,
    student_id TEXT,
    status TEXT,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_shortlists_id ON shortlists(id);

DROP TABLE IF EXISTS drive_applications;
CREATE TABLE drive_applications (
    id TEXT PRIMARY KEY,
    drive_id TEXT,
    student_id TEXT,
    applied_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_drive_applications_id ON drive_applications(id);

DROP TABLE IF EXISTS notification_reads;
CREATE TABLE notification_reads (
    id TEXT PRIMARY KEY,
    notification_id TEXT,
    student_id TEXT,
    key TEXT,
    read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notification_reads_id ON notification_reads(id);

DROP TABLE IF EXISTS notification_broadcast_deliveries;
CREATE TABLE notification_broadcast_deliveries (
    id TEXT PRIMARY KEY,
    campaign_key TEXT,
    subscription_id TEXT,
    student_id TEXT,
    status TEXT,
    attempts REAL,
    last_error TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notification_broadcast_deliveries_id ON notification_broadcast_deliveries(id);

DROP TABLE IF EXISTS d1_cutover_replay_log;
CREATE TABLE d1_cutover_replay_log (
    id TEXT PRIMARY KEY,
    target_table TEXT,
    operation TEXT,
    pk_value TEXT,
    payload TEXT,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_d1_cutover_replay_log_id ON d1_cutover_replay_log(id);

