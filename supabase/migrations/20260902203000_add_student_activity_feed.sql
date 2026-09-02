CREATE TABLE IF NOT EXISTS student_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL,
    prn TEXT,
    student_name TEXT,
    branch TEXT,
    class TEXT,
    year TEXT,
    action TEXT NOT NULL CHECK (action IN ('created','updated','deleted')),
    category TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_id TEXT,
    changed_fields TEXT[] DEFAULT ARRAY[]::TEXT[],
    old_values JSONB DEFAULT '{}'::jsonb,
    new_values JSONB DEFAULT '{}'::jsonb,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_activity_created_at ON student_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_activity_student_id ON student_activity_log(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_activity_branch_year ON student_activity_log(branch, year, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_activity_class ON student_activity_log(class, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_activity_category ON student_activity_log(category, created_at DESC);
ALTER TABLE student_activity_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION log_student_activity() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    row_new JSONB := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
    row_old JSONB := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
    sid UUID; sid_text TEXT; s RECORD; fields TEXT[] := ARRAY[]::TEXT[];
    safe_old JSONB := '{}'::jsonb; safe_new JSONB := '{}'::jsonb;
    cat TEXT; label TEXT; ignored TEXT[] := ARRAY['updated_at','created_at','last_seen_at','avatar_path'];
    k TEXT; v JSONB;
BEGIN
    sid_text := CASE WHEN TG_TABLE_NAME = 'students' THEN COALESCE(row_new->>'id', row_old->>'id') ELSE COALESCE(row_new->>'student_id', row_old->>'student_id') END;
    IF sid_text IS NULL OR sid_text = '' THEN RETURN COALESCE(NEW, OLD); END IF;
    sid := sid_text::uuid;

    SELECT st.prn AS prn,
           COALESCE(st.name,r.name) AS student_name,
           COALESCE(st.branch,r.branch) AS branch,
           COALESCE(st.class,r.class) AS class,
           COALESCE(st.year,r.year) AS year
      INTO s FROM students st LEFT JOIN roster r ON r.prn=st.prn WHERE st.id=sid;

    IF TG_OP='UPDATE' THEN
        FOR k,v IN SELECT key,value FROM jsonb_each(row_new) LOOP
            IF NOT (k=ANY(ignored)) AND (row_old->k IS DISTINCT FROM v) THEN
                fields:=array_append(fields,k); safe_old:=safe_old||jsonb_build_object(k,row_old->k); safe_new:=safe_new||jsonb_build_object(k,v);
            END IF;
        END LOOP;
        IF cardinality(fields)=0 THEN RETURN NEW; END IF;
    ELSE fields:=ARRAY['record']; END IF;

    cat := CASE TG_TABLE_NAME
        WHEN 'students' THEN CASE
            WHEN 'resume_url'=ANY(fields) THEN 'Resume'
            WHEN fields && ARRAY['cgpa_overall','cgpa_semesterwise','backlogs_semesterwise','ssc_marks','hsc_marks'] THEN 'Academics'
            WHEN fields && ARRAY['email','phone','name','branch','class','year','lateral_entry'] THEN 'Profile'
            WHEN fields && ARRAY['github_url','portfolio_url'] THEN 'Professional Links'
            WHEN fields && ARRAY['is_employed','employment_type','company_name','org_type','current_ctc','company_address','hr_name','hr_number'] THEN 'Employment'
            ELSE 'Profile' END
        WHEN 'internships' THEN 'Internships' WHEN 'certificates' THEN 'Certificates'
        WHEN 'student_projects' THEN 'Projects' WHEN 'research_papers' THEN 'Research'
        WHEN 'diploma' THEN 'Academics' WHEN 'student_skills' THEN 'Skills'
        WHEN 'student_competitions' THEN 'Competitions' WHEN 'student_profile_declarations' THEN 'Profile'
        ELSE initcap(replace(TG_TABLE_NAME,'_',' ')) END;

    label := COALESCE(row_new->>'title',row_new->>'name',row_new->>'company',row_new->>'role',row_old->>'title',row_old->>'name',row_old->>'company',row_old->>'role');
    INSERT INTO student_activity_log(student_id,prn,student_name,branch,class,year,action,category,target_table,target_id,changed_fields,old_values,new_values,summary,created_at)
    VALUES(sid,
           COALESCE(s.prn,row_new->>'prn',row_old->>'prn'),
           COALESCE(s.student_name,row_new->>'name',row_old->>'name','Student'),
           COALESCE(s.branch,row_new->>'branch',row_old->>'branch'),
           COALESCE(s.class,row_new->>'class',row_old->>'class'),
           COALESCE(s.year,row_new->>'year',row_old->>'year'),
           CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END,
           cat,TG_TABLE_NAME,COALESCE(row_new->>'id',row_old->>'id'),fields,safe_old,safe_new,
           CASE WHEN TG_OP='UPDATE' THEN cat||' updated: '||array_to_string(fields,', ') WHEN TG_OP='INSERT' THEN cat||' added'||CASE WHEN label IS NOT NULL THEN ': '||label ELSE '' END ELSE cat||' removed'||CASE WHEN label IS NOT NULL THEN ': '||label ELSE '' END END,
           NOW());
    RETURN COALESCE(NEW,OLD);
END; $$;

DO $$ DECLARE t TEXT; BEGIN
    FOREACH t IN ARRAY ARRAY['students','internships','certificates','student_projects','research_papers','diploma','student_skills','student_competitions','student_profile_declarations'] LOOP
        IF to_regclass('public.'||t) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_student_activity_%I ON %I',t,t);
            EXECUTE format('CREATE TRIGGER trg_student_activity_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION log_student_activity()',t,t);
        END IF;
    END LOOP;
END $$;
