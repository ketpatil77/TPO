CREATE INDEX IF NOT EXISTS idx_students_prn ON students(prn);
CREATE INDEX IF NOT EXISTS idx_roster_prn ON roster(prn);
CREATE INDEX IF NOT EXISTS idx_internships_student ON internships(student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_student_projects_student ON student_projects(student_id);;
